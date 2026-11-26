import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { dateTime, statusNames } from "../lib/labels";

export default function History({ shipment }) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    api("shipments/" + shipment.id)
      .then((r) => {
        if (live) {
          setRows(r);
          setError("");
        }
      })
      .catch((e) => {
        if (live) {
          setRows([]);
          setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [expanded, shipment.id, shipment.version]);
  return (
    <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>상태 이력</summary>
      {error}
      <ol>
        {rows.map((r) => (
          <li key={r.version}>
            {statusNames[r.status]} · {dateTime(r.occurred_at)}
          </li>
        ))}
      </ol>
    </details>
  );
}
