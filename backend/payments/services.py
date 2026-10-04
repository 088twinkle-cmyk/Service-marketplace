import base64
import hashlib
import hmac
import uuid
from decimal import Decimal

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from bookings.models import ProjectBooking
from bookings.state_machine import transition

from .models import LedgerTransaction, Payment


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

        ok = bool(
            settings.DEBUG
            and settings.ESEWA_TRUST_SANDBOX_SUCCESS
            and payload.get("force_success")
        )

    if (
        not ok
        and settings.DEBUG
        and settings.ESEWA_TRUST_SANDBOX_SUCCESS
        and payload.get("force_success")
    ):
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

    # Your Django app is named "chats", not "chat".
    from chats.models import Conversation

    Conversation.objects.get_or_create(
        booking=booking
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