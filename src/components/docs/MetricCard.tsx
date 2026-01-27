'use client';

import { useEffect, useState, useRef } from 'react';
import type { Metric } from '@/data/metrics';

interface MetricCardProps {
  metric: Metric;
  animate?: boolean;
}

export function MetricCard({ metric, animate = true }: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : metric.value);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [animate]);

  useEffect(() => {
    if (!animate || !isVisible) return;

    const numericValue = typeof metric.value === 'number' ? metric.value : parseFloat(metric.value);
    if (isNaN(numericValue)) {
      setDisplayValue(metric.value);
      return;
    }

    const duration = 1000;
    const steps = 60;
    const stepDuration = duration / steps;
    const increment = numericValue / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= numericValue) {
        setDisplayValue(numericValue);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current * 10) / 10);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [animate, isVisible, metric.value]);

  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        return val.toLocaleString();
      }
      return val.toFixed(1);
    }
    return val;
  };

  return (
    <div ref={cardRef} className="metric-card">
      <div className={`metric-value ${isVisible ? 'animate' : ''}`}>
        {metric.prefix}
        {formatValue(displayValue)}
        {metric.suffix}
      </div>
      <div className="metric-label">{metric.label}</div>
      {metric.change && (
        <div className={`metric-change ${metric.change.positive ? '' : 'negative'}`}>
          {metric.change.positive ? '+' : '-'}{metric.change.value} {metric.change.period}
        </div>
      )}
    </div>
  );
}
