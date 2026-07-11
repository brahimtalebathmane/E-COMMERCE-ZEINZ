import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

export function AdminTable({ children, className = "" }: Props) {
  return (
    <div className={`admin-table-wrap ${className}`}>
      <table className="admin-table">{children}</table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return <thead className="admin-table-head">{children}</thead>;
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return <tbody className="admin-table-body">{children}</tbody>;
}

export function AdminTableRow({
  children,
  className = "",
  highlight,
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <tr
      className={`admin-table-row ${highlight ? "admin-order-row-new" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

export function AdminTh({
  children,
  className = "",
  align = "start",
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
}) {
  const alignClass =
    align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start";
  return (
    <th scope="col" className={`admin-th ${alignClass} ${className}`}>
      {children}
    </th>
  );
}

export function AdminTd({
  children,
  className = "",
  align = "start",
  mono,
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
  mono?: boolean;
}) {
  const alignClass =
    align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start";
  return (
    <td className={`admin-td ${alignClass} ${mono ? "font-mono tabular-nums" : ""} ${className}`}>
      {children}
    </td>
  );
}
