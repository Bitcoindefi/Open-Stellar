/* eslint-disable @next/next/no-img-element -- ImageResponse renders plain JSX, not next/image. */

import type { District, MoltbotAgent } from "@/lib/types";
import type { AgentCardStats } from "@/lib/og-card-data";

interface AgentCardOGProps {
  agent: MoltbotAgent;
  district: District;
  stats: AgentCardStats;
  profileUrl: string;
  backgroundUrl: string;
  spriteUrl: string;
}

interface DistrictCardOGProps {
  district: District;
  agents: MoltbotAgent[];
  backgroundUrl: string;
}

function StatTile({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: 205,
        height: 112,
        padding: "18px 20px",
        border: `2px solid ${color}55`,
        borderRadius: 14,
        backgroundColor: "rgba(3, 7, 18, 0.82)",
      }}
    >
      <div
        style={{
          color,
          fontFamily: "monospace",
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 10,
          color: "#94a3b8",
          fontFamily: "monospace",
          fontSize: 18,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function CircuitGrid() {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        opacity: 0.18,
        backgroundImage:
          "linear-gradient(rgba(148, 163, 184, 0.38) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.38) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }}
    />
  );
}

export function AgentCardOG({
  agent,
  district,
  stats,
  profileUrl,
  backgroundUrl,
  spriteUrl,
}: AgentCardOGProps) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "1200px",
        height: "630px",
        overflow: "hidden",
        backgroundColor: "#030712",
        color: "#e2e8f0",
        fontFamily: "monospace",
      }}
    >
      <img
        src={backgroundUrl}
        width="1200"
        height="630"
        alt=""
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "1200px",
          height: "630px",
          objectFit: "cover",
          opacity: 0.28,
        }}
      />
      <CircuitGrid />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          backgroundImage:
            "radial-gradient(circle at 24% 34%, rgba(34, 211, 238, 0.25), transparent 28%), linear-gradient(90deg, rgba(3, 7, 18, 0.98), rgba(3, 7, 18, 0.58))",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          padding: "54px 64px 46px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 360,
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 300,
              height: 300,
              border: `3px solid ${agent.color}77`,
              borderRadius: 24,
              backgroundColor: "rgba(15, 23, 42, 0.82)",
            }}
          >
            <img
              src={spriteUrl}
              width="210"
              height="210"
              alt=""
              style={{
                width: "210px",
                height: "210px",
                objectFit: "contain",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              padding: "10px 18px",
              border: `2px solid ${district.color}44`,
              borderRadius: 999,
              color: district.color,
              backgroundColor: "rgba(15, 23, 42, 0.86)",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {district.name}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            paddingLeft: 52,
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#22d3ee",
              fontSize: 20,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            Open Stellar Agent Card
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 18,
              color: agent.color,
              fontSize: 78,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {agent.name}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 18,
              color: "#cbd5e1",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            Level {stats.level} / {stats.tier} Tier / {agent.model}
          </div>

          <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
            <StatTile
              value={agent.tasksCompleted.toLocaleString("en-US")}
              label="Tasks"
              color="#22d3ee"
            />
            <StatTile
              value={`${stats.earnedXlm} XLM`}
              label="Earned"
              color="#fbbf24"
            />
            <StatTile
              value={`${stats.uptime}%`}
              label="Uptime"
              color="#34d399"
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 28,
              flexWrap: "wrap",
            }}
          >
            {stats.skills.map((skill) => (
              <div
                key={skill}
                style={{
                  display: "flex",
                  padding: "8px 12px",
                  border: "1px solid rgba(148, 163, 184, 0.24)",
                  borderRadius: 8,
                  color: "#94a3b8",
                  backgroundColor: "rgba(15, 23, 42, 0.76)",
                  fontSize: 16,
                }}
              >
                {skill}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 34,
              color: "#64748b",
              fontSize: 20,
            }}
          >
            <span>{profileUrl}</span>
            <span style={{ color: "#22d3ee", fontWeight: 800 }}>
              open-stellar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DistrictCardOG({
  district,
  agents,
  backgroundUrl,
}: DistrictCardOGProps) {
  const working = agents.filter(
    (agent) => agent.status === "active" || agent.status === "working",
  ).length;
  const totalTasks = agents.reduce(
    (sum, agent) => sum + agent.tasksCompleted,
    0,
  );
  const avgLoad = Math.round(
    agents.reduce((sum, agent) => sum + agent.cpu, 0) /
      Math.max(1, agents.length),
  );

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "1200px",
        height: "630px",
        overflow: "hidden",
        backgroundColor: "#030712",
        color: "#e2e8f0",
        fontFamily: "monospace",
      }}
    >
      <img
        src={backgroundUrl}
        width="1200"
        height="630"
        alt=""
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "1200px",
          height: "630px",
          objectFit: "cover",
          opacity: 0.34,
        }}
      />
      <CircuitGrid />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          backgroundImage: `linear-gradient(90deg, rgba(3, 7, 18, 0.98), rgba(3, 7, 18, 0.72)), radial-gradient(circle at 78% 22%, ${district.color}44, transparent 32%)`,
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "58px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            color: district.color,
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          Open Stellar District
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            color: "#f8fafc",
            fontSize: 86,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          {district.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            maxWidth: 850,
            color: "#cbd5e1",
            fontSize: 28,
            lineHeight: 1.35,
          }}
        >
          Operational squad telemetry for the {district.name} district.
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 44 }}>
          <StatTile
            value={String(agents.length)}
            label="Agents"
            color={district.color}
          />
          <StatTile value={String(working)} label="Online" color="#34d399" />
          <StatTile
            value={totalTasks.toLocaleString("en-US")}
            label="Tasks"
            color="#22d3ee"
          />
          <StatTile value={`${avgLoad}%`} label="Load" color="#fbbf24" />
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
          {agents.slice(0, 6).map((agent) => (
            <div
              key={agent.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                border: `1px solid ${agent.color}55`,
                borderRadius: 10,
                backgroundColor: "rgba(15, 23, 42, 0.82)",
                color: agent.color,
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              <span>{agent.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
