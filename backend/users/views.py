import random

from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password

from django.core.mail import send_mail

from django.conf import settings

from django.db import transaction

from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .otp_store import set_otp, verify_otp_code, is_otp_verified, clear_otp
from .roles import account_type, normalize_role
from .serializers import ProfileUpdateSerializer

User = get_user_model()

# =========================
# UPDATE PROFILE
# =========================
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_profile(request):
    serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)

def _normalize_email(email):

    return (email or "").strip().lower()





# =========================

# SEND OTP (no account created)

# =========================

@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def send_otp(request):

    email = _normalize_email(request.data.get("email"))



    if not email:

        return Response({"error": "Email is required"}, status=400)



    if User.objects.filter(email=email).exists():

        return Response({"error": "Email already exists"}, status=400)



    otp = str(random.randint(100000, 999999))

    set_otp(email, otp)



    print("OTP FOR", email, ":", otp)



    try:

        send_mail(

            subject="Your OTP Code - Service Marketplace",

            message=f"Your OTP is: {otp}\n\nIt will expire in 5 minutes.\n\nIf you did not request this, ignore this email.",

            from_email=settings.DEFAULT_FROM_EMAIL,

            recipient_list=[email],

            fail_silently=False,

        )



        response_data = {
            "message": "OTP sent successfully — check your inbox and spam folder",
            "email_sent": True,
        }
        if settings.DEBUG:
            response_data["dev_otp"] = otp
        return Response(response_data)



    except Exception as e:

        print("EMAIL ERROR:", str(e))



        if settings.DEBUG:
            print("DEV OTP FOR", email, ":", otp)
            return Response({
                "message": "Email could not be sent. Use the OTP shown below (dev mode).",
                "email_sent": False,
                "dev_otp": otp,
            })



        return Response({

            "error": "Email sending failed",

            "details": str(e),

            "email_sent": False,

        }, status=500)





# =========================

# VERIFY OTP + REGISTER (account created only after valid OTP)

# =========================

@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def verify_otp_register(request):
    username = request.data.get("username")

    password = request.data.get("password")

    email = _normalize_email(request.data.get("email"))

    phone = request.data.get("phone")

    otp = request.data.get("otp")

    role = request.data.get("role", "customer")



    if not username:

        return Response({"error": "Username is required"}, status=400)

    if not email:

        return Response({"error": "Email is required"}, status=400)

    if not phone:

        return Response({"error": "Phone number is required"}, status=400)

    if not password:

        return Response({"error": "Password is required"}, status=400)

    if not otp:

        return Response({"error": "OTP is required"}, status=400)



    otp_ok, otp_error = verify_otp_code(email, otp)

    if not otp_ok:

        return Response({"error": otp_error}, status=400)



    if not is_otp_verified(email):

        return Response({"error": "OTP verification required before registration"}, status=400)



    if User.objects.filter(username__iexact=username).exists():

        return Response({"error": "Username already exists"}, status=400)



    if User.objects.filter(email=email).exists():

        return Response({"error": "Email already exists"}, status=400)



    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
            )
            user.phone = phone
            user.role = normalize_role(role)
            user.save(update_fields=["phone", "role"])
    except Exception as exc:
        print("REGISTER ERROR:", exc)
        return Response({"error": "Registration failed. Please try again."}, status=500)



    clear_otp(email)



    refresh = RefreshToken.for_user(user)



    return Response({

        "message": "User registered successfully",

        "access": str(refresh.access_token),

        "refresh": str(refresh),

        "role": user.role,
        "account_type": account_type(user.role),
        "username": user.username,
        "email": user.email,
    })


# =========================

# LOGIN

# =========================

@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def login(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password")

    if not username:
        return Response({"error": "Username is required"}, status=400)
    if not password:
        return Response({"error": "Password is required"}, status=400)

    user = authenticate(request, username=username, password=password)

    if user is None:
        try:
            by_email = User.objects.get(email=_normalize_email(username))
            user = authenticate(request, username=by_email.username, password=password)
        except User.DoesNotExist:
            user = None

    if user is None:
        return Response({"error": "Invalid username or password"}, status=401)

    if not user.is_active or getattr(user, "is_suspended", False):
        return Response({"error": "Account is disabled"}, status=403)

    refresh = RefreshToken.for_user(user)

    return Response({
        "message": "Login successful",
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "role": user.role,
        "account_type": account_type(user.role),
        "username": user.username,
        "email": user.email,
    })


