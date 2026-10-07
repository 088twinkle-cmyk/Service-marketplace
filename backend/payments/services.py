import base64
import hashlib
import hmac
import logging
import uuid
from decimal import Decimal

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from bookings.models import ProjectBooking
from bookings.state_machine import transition

from notifications.services import (
    EVENT_PAYMENT_FAILED,
    EVENT_PAYMENT_SUCCESS,
    notify,
)

from .models import LedgerTransaction, Payment

logger = logging.getLogger("marketplace")


def _signed_payload(total_amount, transaction_uuid, product_code):
    message = (
        f"total_amount={total_amount},"
        f"transaction_uuid={transaction_uuid},"
        f"product_code={product_code}"
    )

    digest = hmac.new(
        settings.ESEWA_SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256,
    ).digest()

    return base64.b64encode(digest).decode()


def create_payment(booking: ProjectBooking, payer) -> Payment:
    if booking.status not in (
        ProjectBooking.Status.AGREEMENT_REACHED,
        ProjectBooking.Status.PAYMENT_PENDING,
        ProjectBooking.Status.PAYMENT_FAILED,
    ):
        raise ValueError(
            "Payment can only be created after agreement."
        )

    if not booking.agreed_price:
        raise ValueError(
            "Agreed price is required."
        )

    existing = (
        Payment.objects.filter(booking=booking)
        .exclude(status=Payment.Status.FAILED)
        .order_by("-created_at")
        .first()
    )

    if existing and existing.status == Payment.Status.SUCCESS:
        raise ValueError(
            "This booking is already paid."
        )

    if existing and existing.status in (
        Payment.Status.PENDING,
        Payment.Status.INITIATED,
    ):
        return existing

    txn_uuid = str(uuid.uuid4())
    amount = booking.agreed_price

    payment = Payment.objects.create(
        booking=booking,
        payer=payer,
        amount=amount,
        transaction_uuid=txn_uuid,
        idempotency_key=f"booking-{booking.id}-pay-{txn_uuid}",
        signature=_signed_payload(
            str(amount),
            txn_uuid,
            settings.ESEWA_MERCHANT_CODE,
        ),
        status=Payment.Status.PENDING,
    )

    if booking.status == ProjectBooking.Status.AGREEMENT_REACHED:
        transition(
            booking,
            ProjectBooking.Status.PAYMENT_PENDING,
        )
        booking.save(update_fields=["status"])

    elif booking.status == ProjectBooking.Status.PAYMENT_FAILED:
        transition(
            booking,
            ProjectBooking.Status.PAYMENT_PENDING,
        )
        booking.save(update_fields=["status"])

    return payment


def esewa_form_fields(payment: Payment):
    amount = payment.amount
    tax = Decimal("0")
    service_charge = Decimal("0")
    delivery = Decimal("0")

    return {
        "amount": str(amount),
        "tax_amount": str(tax),
        "total_amount": str(amount),
        "transaction_uuid": payment.transaction_uuid,
        "product_code": settings.ESEWA_MERCHANT_CODE,
        "product_service_charge": str(service_charge),
        "product_delivery_charge": str(delivery),
        "success_url": settings.ESEWA_SUCCESS_URL,
        "failure_url": settings.ESEWA_FAILURE_URL,
        "signed_field_names": (
            "total_amount,transaction_uuid,product_code"
        ),
        "signature": payment.signature,
        "form_url": settings.ESEWA_FORM_URL,
    }


def sandbox_credentials_absent() -> bool:
    """
    True only while the deployment is still on the public eSewa test
    credentials (or none at all).

    The sandbox override exists so that developers without eSewa merchant
    credentials can still exercise the booking → payment → confirmed flow.
    As soon as a real merchant code is configured the override can never
    fire again, so production can never be tricked into a fake success.
    """
    merchant_code = (settings.ESEWA_MERCHANT_CODE or "").strip()

    return merchant_code in ("", "EPAYTEST")


def sandbox_override_allowed(payload: dict | None = None) -> bool:
    payload = payload or {}

    return bool(
        settings.DEBUG
        and settings.ESEWA_TRUST_SANDBOX_SUCCESS
        and sandbox_credentials_absent()
        and payload.get("force_success")
    )


def verify_esewa(
    payment: Payment,
    gateway_ref: str = "",
    payload: dict | None = None,
) -> Payment:
    if payment.status == Payment.Status.SUCCESS:
        return payment

    payload = payload or {}
    ok = False

    try:
        response = requests.get(
            settings.ESEWA_STATUS_URL,
            params={
                "product_code": settings.ESEWA_MERCHANT_CODE,
                "total_amount": str(payment.amount),
                "transaction_uuid": payment.transaction_uuid,
            },
            timeout=20,
        )

        data = response.json() if response.content else {}

        payment.raw_payload = {
            "status_api": data,
            "client": payload,
        }

        status_value = str(
            data.get("status", "")
        ).upper()

        ok = status_value == "COMPLETE"

        if data.get("ref_id"):
            gateway_ref = data["ref_id"]

    except (requests.RequestException, ValueError) as exc:
        payment.raw_payload = {
            "error": str(exc),
            "client": payload,
        }

        ok = sandbox_override_allowed(payload)

    if not ok and sandbox_override_allowed(payload):
        logger.warning(
            "SANDBOX PAYMENT OVERRIDE: payment %s marked successful because "
            "DEBUG + ESEWA_TRUST_SANDBOX_SUCCESS are on, no real eSewa "
            "merchant credentials are configured and the client asked to "
            "force success. Configure ESEWA_MERCHANT_CODE/ESEWA_SECRET_KEY "
            "for a real gateway (the override is disabled automatically).",
            payment.pk,
        )
        ok = True

    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(
            pk=payment.pk
        )

        if payment.status == Payment.Status.SUCCESS:
            return payment

        if ok:
            mark_success(
                payment,
                gateway_ref,
            )
        else:
            payment.status = Payment.Status.FAILED

            payment.save(
                update_fields=[
                    "status",
                    "raw_payload",
                ]
            )

            logger.warning(
                "Payment %s for booking %s FAILED (gateway status=%s)",
                payment.pk,
                payment.booking_id,
                (payment.raw_payload or {}).get("status_api"),
            )

            if payment.payer:
                notify(
                    payment.payer,
                    "Payment failed",
                    f"Your payment of Rs {payment.amount} could not be completed. You can try again.",
                    EVENT_PAYMENT_FAILED,
                )

            booking = payment.booking

            if booking.status == ProjectBooking.Status.PAYMENT_PENDING:
                transition(
                    booking,
                    ProjectBooking.Status.PAYMENT_FAILED,
                )

                booking.save(
                    update_fields=["status"]
                )

        return payment


def mark_success(
    payment: Payment,
    gateway_ref: str = "",
):
    logger.info(
        "Payment %s SUCCESS for booking %s (amount=%s, ref=%s)",
        payment.pk,
        payment.booking_id,
        payment.amount,
        gateway_ref or payment.gateway_ref,
    )
    payment.status = Payment.Status.SUCCESS
    payment.gateway_ref = (
        gateway_ref or payment.gateway_ref
    )
    payment.verified_at = timezone.now()

    payment.save(
        update_fields=[
            "status",
            "gateway_ref",
            "verified_at",
            "raw_payload",
        ]
    )

    LedgerTransaction.objects.get_or_create(
        payment=payment,
        kind=LedgerTransaction.Kind.CHARGE,
        defaults={
            "booking": payment.booking,
            "amount": payment.amount,
            "note": "Client payment captured",
        },
    )

    LedgerTransaction.objects.get_or_create(
        payment=payment,
        kind=LedgerTransaction.Kind.ESCROW_HOLD,
        defaults={
            "booking": payment.booking,
            "amount": payment.amount,
            "note": "Held until completion",
        },
    )

    booking = payment.booking

    if booking.status in (
        ProjectBooking.Status.PAYMENT_PENDING,
        ProjectBooking.Status.PAYMENT_FAILED,
    ):
        transition(
            booking,
            ProjectBooking.Status.CONFIRMED,
        )

        booking.paid_at = timezone.now()

        booking.save(
            update_fields=[
                "status",
                "paid_at",
            ]
        )

    # Chat becomes available once the booking is paid and confirmed.
    from chats.models import Conversation

    Conversation.objects.get_or_create(booking=booking)

    if payment.payer:
        notify(
            payment.payer,
            "Payment confirmed",
            f"Payment of Rs {payment.amount} for “{booking.title}” was successful. "
            "The booking is confirmed and you can now chat with your provider.",
            EVENT_PAYMENT_SUCCESS,
        )
    if booking.freelancer:
        notify(
            booking.freelancer.user,
            "Booking confirmed",
            f"“{booking.title}” is confirmed and paid. You can start the work.",
            EVENT_PAYMENT_SUCCESS,
        )


def settle_booking(booking: ProjectBooking):
    payment = (
        booking.payments
        .filter(
            status=Payment.Status.SUCCESS
        )
        .first()
    )

    if not payment:
        return

    if booking.transactions.filter(
        kind=LedgerTransaction.Kind.SETTLEMENT
    ).exists():
        return

    LedgerTransaction.objects.create(
        payment=payment,
        booking=booking,
        kind=LedgerTransaction.Kind.SETTLEMENT,
        amount=payment.amount,
        note="Released to freelancer after completion",
    )