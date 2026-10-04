def issue_tokens(user: User):
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "user": UserSerializer(user).data,
    }
def send_otp(user: User, purpose: str = "login"):
    code = f"{secrets.randbelow(1_000_000):06d}"
    OTPCode.objects.create(
        user=user,
        code_hash=_hash_otp(code),
        expires_at=timezone.now() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES),
        purpose=purpose,
    )
    send_mail(
        subject="Your marketplace verification code",
        message=f"Your OTP code is {code}. It expires in {settings.OTP_EXPIRY_MINUTES} minutes.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )
    return code
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        code = send_otp(user, purpose="register")
        payload = issue_tokens(user)
        if settings.OTP_DEBUG_RETURN:
            payload["debug_otp"] = code
        return Response(payload, status=status.HTTP_201_CREATED)
class LoginView(generics.GenericAPIView):
    serializer_class = LoginSerializer
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            email = serializer.validated_data["email"]
            try:
                candidate = User.objects.get(email=email)
            except User.DoesNotExist:
                candidate = None
            if candidate and candidate.check_password(serializer.validated_data["password"]):
                user = candidate
        if user is None or not user.is_active_account:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
        payload = issue_tokens(user)
        if not user.is_otp_verified:
            code = send_otp(user)
            if settings.OTP_DEBUG_RETURN:
                payload["debug_otp"] = code
            payload["otp_required"] = True
        return Response(payload)
class OTPRequestView(generics.GenericAPIView):
    serializer_class = OTPRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request):
        code = send_otp(request.user)
        data = {"detail": "OTP sent."}
        if settings.OTP_DEBUG_RETURN:
            data["debug_otp"] = code
        return Response(data)
class OTPVerifyView(generics.GenericAPIView):
    serializer_class = OTPVerifySerializer
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        otp = (
            OTPCode.objects.filter(
                user=request.user,
                consumed_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .order_by("-created_at")
            .first()
        )
        if not otp or otp.code_hash != _hash_otp(code):
            return Response({"detail": "Invalid or expired OTP."}, status=status.HTTP_400_BAD_REQUEST)
        otp.consumed_at = timezone.now()
        otp.save(update_fields=["consumed_at"])
        request.user.is_otp_verified = True
        request.user.save(update_fields=["is_otp_verified"])
        return Response(issue_tokens(request.user))
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    data = UserSerializer(request.user).data
    if request.user.role == User.Role.CLIENT:
        profile, _ = ClientProfile.objects.get_or_create(user=request.user)
        data["client_profile"] = ClientProfileSerializer(profile).data
    if request.user.role == User.Role.FREELANCER:
        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        data["freelancer_profile"] = FreelancerProfileSerializer(profile).data
        if hasattr(profile, "kyc"):
            data["kyc"] = KYCSerializer(profile.kyc).data
    return Response(data)
class ClientProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ClientProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    def get_object(self):
        profile, _ = ClientProfile.objects.get_or_create(user=self.request.user)
        return profile
class FreelancerProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = FreelancerProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    def get_object(self):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        return profile
class FreelancerPublicViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = FreelancerProfileSerializer
    permission_classes = [permissions.AllowAny]
    queryset = FreelancerProfile.objects.select_related("user").prefetch_related("skills", "kyc")
    filterset_fields = ["is_available", "location"]
    search_fields = ["professional_title", "bio", "location", "user__email", "skills__name"]
