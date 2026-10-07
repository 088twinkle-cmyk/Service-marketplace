/**
 * Route table for the browser build.
 *
 * Mirrors the file-based routes in `app/` so the same screens and URLs work
 * in the browser. `page` components are the exact same modules the native
 * (Expo Router) build uses — no screen was modified for the web.
 */
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import ChooseServicesScreen from "./screens/customer/ChooseServicesScreen";
import HomeScreen from "./screens/customer/HomeScreen";
import BookScreen from "./screens/customer/BookScreen";
import ChatScreen from "./screens/customer/ChatScreen";
import CustomerDashboardScreen from "./screens/customer/CustomerDashboardScreen";
import SearchScreen from "./screens/customer/SearchScreen";
import ServiceDetailScreen from "./screens/customer/ServiceDetailScreen";

import ForgotPasswordScreen from "./screens/auth/ForgotPasswordScreen";
import LoginScreen from "./screens/auth/LoginScreen";
import OtpScreen from "./screens/auth/OtpScreen";
import RegisterScreen from "./screens/auth/RegisterScreen";
import ResetPasswordScreen from "./screens/auth/ResetPasswordScreen";

import ProviderAvailabilityScreen from "./screens/provider/ProviderAvailabilityScreen";
import ProviderBookingsScreen from "./screens/provider/ProviderBookingsScreen";
import ProviderHomeScreen from "./screens/provider/ProviderHomeScreen";
import ProviderKycScreen from "./screens/provider/ProviderKycScreen";
import ProviderOnboardingScreen from "./screens/provider/ProviderOnboardingScreen";
import ProviderServicesScreen from "./screens/provider/ProviderServicesScreen";

import NotFoundScreen from "./screens/shared/NotFoundScreen";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomeScreen />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/register" element={<RegisterScreen />} />
      <Route path="/otp" element={<OtpScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
      <Route path="/search" element={<SearchScreen />} />
      <Route path="/service/:id" element={<ServiceDetailScreen />} />

      {/* Customer */}
      <Route path="/choose-services" element={<ChooseServicesScreen />} />
      <Route path="/dashboard" element={<CustomerDashboardScreen />} />
      <Route path="/book" element={<BookScreen />} />
      <Route path="/chat" element={<ChatScreen />} />

      {/* Provider */}
      <Route path="/provider-onboarding" element={<ProviderOnboardingScreen />} />
      <Route path="/provider-kyc" element={<ProviderKycScreen />} />
      <Route path="/provider-home" element={<ProviderHomeScreen />} />
      <Route path="/provider-services" element={<ProviderServicesScreen />} />
      <Route path="/provider-bookings" element={<ProviderBookingsScreen />} />
      <Route
        path="/provider-availability"
        element={<ProviderAvailabilityScreen />}
      />

      {/* Fallback */}
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
