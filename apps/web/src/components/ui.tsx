import type { ReactNode } from "react";
import {
  Check,
  X,
  AlertTriangle,
  Minus,
  HelpCircle,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { healthLabel, type Health } from "../lib/report";

const healthIcon: Record<Health, LucideIcon> = {
  ok: Check,
  fail: X,
  warn: AlertTriangle,
  unknown: HelpCircle,
  na: Minus,
  running: LoaderCircle,
};

export function StatusIcon({
  health,
  size = 18,
}: {
  health: Health;
  size?: number;
}) {
  const Icon = healthIcon[health];
  return (
    <span
      className={`status-icon h-${health}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon
        size={Math.round(size * 0.62)}
        strokeWidth={2.4}
        className={health === "running" ? "spin" : undefined}
      />
    </span>
  );
}

export function StatusPill({
  health,
  label,
}: {
  health: Health;
  label?: string;
}) {
  return (
    <span className={`pill h-${health}`}>
      <span className="pill-dot" />
      {label ?? healthLabel[health]}
    </span>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {description && <p className="card-desc">{description}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? "card-body flush" : "card-body"}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={18} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Health;
}) {
  return (
    <div className="metric">
      <span className="metric-label">
        {tone && <span className={`dot h-${tone}`} />}
        {label}
      </span>
      <strong className="metric-value">{value}</strong>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}
