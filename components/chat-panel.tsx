"use client";

import { useRef, useEffect } from "react";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
}

export function ChatPanel({ messages }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 6px #34d399",
          }}
        />
        <span
          style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}
        >
          MOLTBOT COMMS
        </span>
        <span
          suppressHydrationWarning
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "#475569",
            marginLeft: "auto",
          }}
        >
          {messages.length} msgs
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 0",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {messages.length === 0 && (
          <div style={{ padding: 20, textAlign: "center" }}>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: "#475569",
              }}
            >
              Waiting for bot transmissions...
            </span>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: "6px 12px",
              borderLeft: `2px solid ${msg.fromColor}22`,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "#111827";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                "transparent";
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 2,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: msg.fromColor,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  color: msg.fromColor,
                }}
              >
                {msg.fromName}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  color: "#334155",
                }}
              >
                {">"}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "#64748b",
                }}
              >
                {msg.toName}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  color: "#334155",
                  marginLeft: "auto",
                }}
              >
                {msg.timestamp}
              </span>
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: "#cbd5e1",
                paddingLeft: 12,
                lineHeight: 1.4,
              }}
            >
              {msg.message}
            </div>
          </div>
        ))}
      </div>

      {/* Observer mode banner */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#0a0e17",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#334155",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "#334155",
            letterSpacing: 1,
          }}
        >
          READ-ONLY — agent communications only
        </span>
      </div>
    </div>
  );
}
