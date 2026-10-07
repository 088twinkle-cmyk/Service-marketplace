/**
 * GigCard — legacy name kept so existing screens (and tests) keep working.
 * The visual implementation now lives in `ServiceCard`.
 */
import React from "react";

import type { ServiceItem } from "../services/api/servicesApi";
import ServiceCard from "./ServiceCard";

type Props = {
  service: ServiceItem;
  onPress: () => void;
  index?: number;
};

export default function GigCard({ service, onPress, index = 0 }: Props) {
  return <ServiceCard service={service} onPress={onPress} index={index} />;
}
