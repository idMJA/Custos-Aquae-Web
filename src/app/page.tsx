"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useMqtt, SensorData } from "@/lib/useMqtt";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  FiDroplet,
  FiThermometer,
  FiWind,
  FiCamera,
  FiSettings,
  FiActivity,
  FiCloudRain,
  FiSun,
  FiDatabase,
  FiWifi,
  FiAlertTriangle,
  FiCheckCircle,
  FiAlertOctagon,
  FiInfo,
  FiPlay,
  FiRefreshCw,
  FiZap,
  FiNavigation,
  FiTrendingUp,
  FiClock,
  FiEye,
  FiRadio,
  FiShield,
} from "react-icons/fi";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusLevel = 0 | 1 | 2 | 3;

interface StatusConfig {
  label: string;
  description: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ReactNode;
  ringColor: string;
  dotColor: string;
  bannerBg: string;
  bannerBorder: string;
  tankColor: string;
  accentText: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SENSOR_DISTANCE = 80; // cm — max empty distance

const STATUS_MAP: Record<StatusLevel, StatusConfig> = {
  0: {
    label: "Safe",
    description:
      "All parameters normal. System operating optimally.",
    badgeVariant: "secondary",
    icon: <FiCheckCircle className="size-4" />,
    ringColor: "ring-emerald-500/30",
    dotColor: "bg-emerald-400",
    bannerBg: "bg-emerald-500/5",
    bannerBorder: "border-emerald-500/20",
    tankColor: "from-sky-500 to-cyan-400",
    accentText: "text-emerald-400",
  },
  1: {
    label: "Caution",
    description:
      "Rain detected or turbidity rising. Monitor closely.",
    badgeVariant: "outline",
    icon: <FiInfo className="size-4" />,
    ringColor: "ring-yellow-500/30",
    dotColor: "bg-yellow-400",
    bannerBg: "bg-yellow-500/5",
    bannerBorder: "border-yellow-500/20",
    tankColor: "from-yellow-500 to-amber-400",
    accentText: "text-yellow-400",
  },
  2: {
    label: "Warning",
    description:
      "Water level rising near safe limits. Take precautions.",
    badgeVariant: "secondary",
    icon: <FiAlertTriangle className="size-4" />,
    ringColor: "ring-orange-500/30",
    dotColor: "bg-orange-400",
    bannerBg: "bg-orange-500/5",
    bannerBorder: "border-orange-500/20",
    tankColor: "from-orange-500 to-amber-400",
    accentText: "text-orange-400",
  },
  3: {
    label: "Danger",
    description:
      "FLOOD ALERT — Levels critical. Alarm and camera activated.",
    badgeVariant: "destructive",
    icon: <FiAlertOctagon className="size-4" />,
    ringColor: "ring-red-500/40",
    dotColor: "bg-red-400",
    bannerBg: "bg-red-500/8",
    bannerBorder: "border-red-500/30",
    tankColor: "from-red-500 to-rose-400",
    accentText: "text-red-400",
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  unit,
  sub,
  accentClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accentClass?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className={cn("text-muted-foreground", accentClass)}>
            {icon}
          </span>
          <CardDescription>{label}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold tracking-tight tabular-nums", accentClass)}>
          {value}
          {unit && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function LogEntry({
  type,
  time,
  message,
}: {
  type: "info" | "success" | "warning" | "error";
  time: string;
  message: string;
}) {
  const styles = {
    info: "text-muted-foreground",
    success: "text-emerald-400",
    warning: "text-yellow-400",
    error: "text-red-400",
  };
  const icons = {
    info: <FiInfo className="size-3 shrink-0 mt-0.5" />,
    success: <FiCheckCircle className="size-3 shrink-0 mt-0.5" />,
    warning: <FiAlertTriangle className="size-3 shrink-0 mt-0.5" />,
    error: <FiAlertOctagon className="size-3 shrink-0 mt-0.5" />,
  };
  return (
    <div className={cn("flex gap-2 text-xs font-mono", styles[type])}>
      {icons[type]}
      <span className="text-muted-foreground shrink-0">[{time}]</span>
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

const emergencyHubStyles = `
  @keyframes evac-flow {
    to { stroke-dashoffset: -20px; }
  }
  @keyframes radar-pulse {
    0% { r: 5px; opacity: 1; stroke-width: 2px; }
    100% { r: 30px; opacity: 0; stroke-width: 0.5px; }
  }
  .animate-evac-route-inline {
    stroke-dasharray: 6, 6;
    animation: evac-flow 1.5s linear infinite;
  }
  .animate-radar-ring-inline {
    animation: radar-pulse 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    transform-origin: 40px 160px;
  }
  .animate-radar-ring-green-inline {
    animation: radar-pulse 2.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    transform-origin: 260px 50px;
  }
`;

// ─── Emergency Action Hub Component ──────────────────────────────────────────
function EmergencyHub({
  status,
}: {
  status: StatusLevel;
}) {
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});
  const [showPrepGuide, setShowPrepGuide] = useState(false);

  const toggleTask = (taskKey: string) => {
    setCheckedTasks((prev) => ({
      ...prev,
      [taskKey]: !prev[taskKey],
    }));
  };

  const warningTasks = [
    { key: "vehicle", label: "Move vehicles to higher ground.", icon: "🚗" },
    { key: "electronics", label: "Secure electronics and important documents.", icon: "🔌" },
    { key: "drainage", label: "Clean drainage channels around the house if possible.", icon: "🧹" },
    { key: "bag", label: "Prepare emergency bag with medicines, food, drinking water, and documents.", icon: "🎒" },
    { key: "monitor", label: "Monitor conditions via the website.", icon: "📱" },
  ];

  const emergencyContacts = [
    { name: "Integrated Emergency Services", number: "112", desc: "All Emergencies (Toll-Free)", icon: <FiActivity className="text-rose-500 size-4" /> },
    { name: "Police Department", number: "110", desc: "Security & Law Enforcement", icon: <FiShield className="text-blue-500 size-4" /> },
    { name: "Fire Department", number: "113", desc: "Firefighting & Rescue", icon: <FiZap className="text-orange-500 size-4" /> },
    { name: "Ambulance / Medical Services", number: "119", desc: "First Aid / Medical Evacuation", icon: <FiThermometer className="text-emerald-500 size-4" /> },
    { name: "Search & Rescue (BASARNAS)", number: "115", desc: "Search & Rescue Operations", icon: <FiNavigation className="text-cyan-500 size-4" /> },
  ];

  if (status === 2) {
    return (
      <Card className="border-orange-500/30 bg-orange-500/5 ring-1 ring-orange-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="size-5 text-orange-400 animate-bounce" />
            <CardTitle className="text-orange-400">Action Hub (WARNING ACTIVE)</CardTitle>
          </div>
          <CardDescription className="text-orange-400/80">
            Warning: Water levels are increasing. Please secure valuable belongings and prepare for possible evacuation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-sm font-semibold text-orange-200">
            Recommended Action Checklist:
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {warningTasks.map((t) => {
              const isChecked = !!checkedTasks[t.key];
              return (
                <button
                  key={t.key}
                  onClick={() => toggleTask(t.key)}
                  className={cn(
                    "flex items-center gap-3 w-full text-left p-3 rounded-2xl border transition-all duration-300 cursor-pointer",
                    isChecked
                      ? "bg-orange-500/10 border-orange-500/40 text-orange-200/60 line-through"
                      : "bg-muted/30 border-border hover:bg-muted/50 hover:border-orange-500/20 text-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border text-[10px]",
                      isChecked ? "border-orange-500 bg-orange-500 text-black font-bold" : "border-muted-foreground/30"
                    )}
                  >
                    {isChecked && "✓"}
                  </div>
                  <span className="text-xs shrink-0">{t.icon}</span>
                  <span className="text-xs md:text-sm">{t.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 3) {
    return (
      <Card className="border-red-500/40 bg-red-500/5 ring-1 ring-red-500/30 animate-pulse">
        {/* Style block for self-contained SVG path flow and radar animations */}
        <style dangerouslySetInnerHTML={{ __html: emergencyHubStyles }} />
        <CardHeader>
          <div className="flex items-center gap-2">
            <FiAlertOctagon className="size-5 text-red-500 animate-pulse" />
            <CardTitle className="text-red-400">Emergency Action Hub (DANGER ACTIVE)</CardTitle>
          </div>
          <CardDescription className="text-red-400/80">
            Danger: Flooding has been detected in your area. Evacuate immediately to the nearest safe location.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 animate-none">
          {/* Status Sistem */}
          <div className="flex flex-col gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <div className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-500 animate-ping" />
              EMERGENCY SYSTEM STATUS:
            </div>
            <ul className="text-xs text-red-200/90 list-disc list-inside space-y-1.5 pl-1">
              <li>Emergency notifications sent automatically to all users in the area via Telegram.</li>
              <li>Self-evacuation route activated in real-time.</li>
              <li>Sensor buzzer active for local evacuation alerts.</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Visualisasi Rute Evakuasi */}
            <div className="flex flex-col gap-3">
              <div className="text-xs font-semibold text-red-200 flex items-center gap-1.5">
                <FiNavigation className="size-4 text-red-400" />
                Evacuation Route & Nearest Assembly Point:
              </div>
              <div className="relative aspect-video rounded-3xl border border-border bg-muted/20 overflow-hidden flex flex-col justify-between p-4 min-h-[220px]">
                {/* Custom SVG Map Grid Decorator */}
                <svg className="absolute inset-0 size-full pointer-events-none opacity-40" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  {/* Evacuation Path */}
                  <path
                    d="M 40,160 Q 80,100 160,110 T 260,50"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="3"
                    className="animate-evac-route-inline"
                  />
                  {/* Warning Radar at Sensor */}
                  <circle cx="40" cy="160" r="15" fill="none" stroke="#ef4444" strokeWidth="1" className="animate-radar-ring-inline" />
                  <circle cx="40" cy="160" r="5" fill="#ef4444" />
                  {/* Safe Point Radar */}
                  <circle cx="260" cy="50" r="20" fill="none" stroke="#22c55e" strokeWidth="1.5" className="animate-radar-ring-green-inline" />
                  <circle cx="260" cy="50" r="6" fill="#22c55e" />
                </svg>

                {/* Legend Overlay */}
                <div className="z-10 flex justify-between w-full">
                  <div className="flex flex-col gap-1 bg-black/60 backdrop-blur-sm p-2 rounded-xl border border-red-500/20">
                    <span className="text-[10px] text-red-400 font-bold flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-red-500 animate-ping" />
                      SENSOR UNIT
                    </span>
                    <span className="text-[9px] text-white/60">Main Monitoring Station</span>
                  </div>
                  <div className="flex flex-col gap-1 bg-black/60 backdrop-blur-sm p-2 rounded-xl border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      ASSEMBLY POINT
                    </span>
                    <span className="text-[9px] text-white/60">Village Hall (Safe Zone)</span>
                  </div>
                </div>

                <div className="z-10 bg-black/60 backdrop-blur-sm p-2.5 rounded-xl border border-border mt-auto flex items-center justify-between text-[10px] text-white/80">
                  <span>Safe Distance: <b>350m</b></span>
                  <span>Route Condition: <b>Flood Free</b></span>
                </div>
              </div>
            </div>

            {/* Nomor Darurat Utama */}
            <div className="flex flex-col gap-3">
              <div className="text-xs font-semibold text-red-200">
                Contact Related Emergency Services:
              </div>
              <div className="flex flex-col gap-2">
                {emergencyContacts.map((c) => (
                  <div
                    key={c.number}
                    className="flex items-center justify-between p-2.5 rounded-2xl border border-border bg-muted/10 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-card border border-border">
                        {c.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">{c.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{c.desc}</div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 text-xs border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white cursor-pointer animate-none"
                      asChild
                    >
                      <a href={`tel:${c.number}`}>Call {c.number}</a>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      );
    }

  // Safe or Caution: disaster preparedness general guide
  return (
    <Card size="sm" className="border-border/40 bg-muted/10">
      <CardContent className="py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FiInfo className="size-4 text-sky-400" />
            <span className="text-xs font-medium text-foreground">
              All parameters normal. Monitor weather conditions regularly.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPrepGuide((v) => !v)}
            className="text-xs h-7 text-primary hover:text-primary/80 px-2 cursor-pointer"
          >
            {showPrepGuide ? "Hide Emergency Guide" : "Disaster Preparedness Guide"}
          </Button>
        </div>

        {showPrepGuide && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-3 border-t border-border/50">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-foreground">Preparedness Actions:</span>
              <ul className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                <li>Identify evacuation routes and nearest assembly point.</li>
                <li>Prepare disaster bag (valuable files, medicines, snacks).</li>
                <li>Save main emergency contact numbers in your phone.</li>
                <li>Ensure water channels/drainage are free of debris.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-foreground">Contact Emergency Services:</span>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                {emergencyContacts.map((c) => (
                  <div key={c.number} className="flex justify-between items-center p-1.5 border border-border/40 rounded-xl bg-card/50">
                    <span className="font-medium truncate">{c.name.split(" ")[0]}</span>
                    <a href={`tel:${c.number}`} className="text-primary hover:underline font-mono font-bold">{c.number}</a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const { connectionStatus, sensorData, cameraImage, publishControl, publishThresholds, publishWifiSettings, logs } = useMqtt();
  const [clock, setClock] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [demo, setDemo] = useState<SensorData>({
    waterTemp: 26.4,
    waterLevel: 45,
    tds: 175,
    turbidity: 11.2,
    flowRate: 1.32,
    totalLiters: 18.46,
    airTemp: 30.1,
    airHum: 71,
    airPress: 1012.4,
    rainAnalog: 4095,
    rainDigital: 0,
    status: 0,
    manualTrigger: 0,
    cameraIp: "192.168.1.102",
    cameraStatus: "Idle",
    warningThreshold: 40,
    dangerThreshold: 30,
  });

  const [serialConnected, setSerialConnected] = useState(false);
  const [serialData, setSerialData] = useState<SensorData | null>(null);
  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const readableStreamClosedRef = useRef<any>(null);

  const data = demoMode ? demo : serialConnected ? serialData : sensorData;

  const connectSerial = async () => {
    if (typeof window === "undefined" || !("serial" in navigator)) {
      alert("Web Serial API is not supported in this browser. Please use a desktop Chromium-based browser like Chrome, Edge, or Opera.");
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setSerialConnected(true);
      
      const decoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(decoder.writable);
      readableStreamClosedRef.current = readableStreamClosed;
      
      const inputStream = decoder.readable;
      const reader = inputStream.getReader();
      serialReaderRef.current = reader;

      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("[SERIAL_DATA]")) {
              try {
                const jsonStr = trimmed.substring(13).trim();
                const parsed = JSON.parse(jsonStr);
                parsed.timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
                setSerialData(parsed);
              } catch (err) {
                console.error("[Serial] JSON Parse error:", err);
              }
            }
          }
        }
      } catch (readErr) {
        console.warn("[Serial] Stream read interrupted or cancelled:", readErr);
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {}
      }
    } catch (err) {
      console.error("[Serial] Connection failed:", err);
      setSerialConnected(false);
    }
  };

  const disconnectSerial = async () => {
    try {
      if (serialReaderRef.current) {
        try {
          await serialReaderRef.current.cancel();
        } catch (e) {}
      }
      if (readableStreamClosedRef.current) {
        try {
          await readableStreamClosedRef.current;
        } catch (e) {}
      }
      if (serialPortRef.current) {
        try {
          await serialPortRef.current.close();
        } catch (e) {}
      }
    } catch (err) {
      console.error("[Serial] Error disconnecting:", err);
    } finally {
      serialPortRef.current = null;
      serialReaderRef.current = null;
      readableStreamClosedRef.current = null;
      setSerialConnected(false);
    }
  };

  const toggleSerialConnection = () => {
    if (serialConnected) {
      disconnectSerial();
    } else {
      connectSerial();
    }
  };

  const sendSerialCommand = async (commandObj: any) => {
    if (serialPortRef.current && serialPortRef.current.writable) {
      try {
        const writer = serialPortRef.current.writable.getWriter();
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(JSON.stringify(commandObj) + "\n"));
        writer.releaseLock();
      } catch (err) {
        console.error("[Serial] Failed to send command:", err);
      }
    }
  };

  useEffect(() => {
    const handleDisconnect = (event: any) => {
      if (serialPortRef.current && event.target === serialPortRef.current) {
        console.warn("[Serial] Device disconnected physically.");
        disconnectSerial();
      }
    };
    if (typeof window !== "undefined" && "serial" in navigator) {
      (navigator as any).serial.addEventListener("disconnect", handleDisconnect);
    }
    return () => {
      if (typeof window !== "undefined" && "serial" in navigator) {
        (navigator as any).serial.removeEventListener("disconnect", handleDisconnect);
      }
    };
  }, []);

  const [warningInput, setWarningInput] = useState<string>("40");
  const [dangerInput, setDangerInput] = useState<string>("30");
  const [wifiSsidInput, setWifiSsidInput] = useState<string>("");
  const [wifiPasswordInput, setWifiPasswordInput] = useState<string>("");

  useEffect(() => {
    if (data?.warningThreshold) {
      setWarningInput(data.warningThreshold.toString());
    }
  }, [data?.warningThreshold]);

  useEffect(() => {
    if (data?.dangerThreshold) {
      setDangerInput(data.dangerThreshold.toString());
    }
  }, [data?.dangerThreshold]);



  // Live clock
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Demo simulation
  useEffect(() => {
    if (!demoMode) return;
    const id = setInterval(() => {
      setDemo((p) => {
        const flow = p.manualTrigger
          ? 0
          : +(Math.max(0, p.flowRate + (Math.random() - 0.5) * 0.1)).toFixed(2);
        const dist = p.manualTrigger
          ? +(Math.max(12, p.waterLevel - 1.2)).toFixed(1)
          : +(Math.max(18, Math.min(62, p.waterLevel + (Math.random() - 0.5) * 0.6))).toFixed(1);
        const wT = p.warningThreshold ?? 35;
        const dT = p.dangerThreshold ?? 20;
        let status: StatusLevel = 0;
        if (dist < dT || p.manualTrigger) status = 3;
        else if (dist < wT) status = 2;
        else if (p.rainDigital === 1) status = 1;
        return {
          ...p,
          waterLevel: dist,
          waterTemp: +(24.5 + Math.random() * 3).toFixed(1),
          tds: Math.round(155 + Math.random() * 60),
          turbidity: +(8 + Math.random() * 8).toFixed(1),
          flowRate: flow,
          totalLiters: +(p.totalLiters + flow / 60).toFixed(3),
          airTemp: +(27 + Math.random() * 4).toFixed(1),
          airHum: Math.round(68 + Math.random() * 12),
          status,
        };
      });
    }, 1200);
    return () => clearInterval(id);
  }, [demoMode]);

  const status = (data?.status ?? 0) as StatusLevel;
  const cfg = STATUS_MAP[status];
  const warningThreshold = data?.warningThreshold ?? 35;
  const dangerThreshold = data?.dangerThreshold ?? 20;

  // Water level visual calc (sensor measures distance DOWN to water surface)
  const waterHeight = data ? MAX_SENSOR_DISTANCE - data.waterLevel : 0;
  const fillPct = Math.max(0, Math.min(100, (waterHeight / MAX_SENSOR_DISTANCE) * 100));

  // MQTT/Serial connection badge
  const connLabel = demoMode
    ? "Demo"
    : serialConnected
    ? "USB Serial"
    : connectionStatus === "connected"
    ? "Live"
    : connectionStatus === "connecting"
    ? "Connecting…"
    : "Offline";
  const connDot = demoMode
    ? "bg-violet-400 animate-pulse"
    : serialConnected
    ? "bg-cyan-400 animate-pulse"
    : connectionStatus === "connected"
    ? "bg-emerald-400 animate-pulse"
    : connectionStatus === "connecting"
    ? "bg-yellow-400 animate-pulse"
    : "bg-red-400";

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ── Decorative background ──────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% -10%, oklch(0.55 0.18 240 / 12%) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 100%, oklch(0.6 0.15 190 / 8%) 0%, transparent 60%), oklch(0.13 0.008 240)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8 flex flex-col gap-6">
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-11 items-center justify-center rounded-2xl",
                "bg-primary/10 ring-1 ring-primary/30"
              )}
            >
              <FiDroplet className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                Custos Aquae
              </h1>
              <p className="text-xs text-muted-foreground">
                Flood Detection & Water Quality Monitor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Clock */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-mono text-muted-foreground">
              <FiClock className="size-3" />
              <span className="text-foreground font-medium tabular-nums">{clock}</span>
            </div>

            {/* MQTT status */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
              <span className={cn("size-2 rounded-full", connDot)} />
              <span className="font-medium text-foreground">{connLabel}</span>
              {!demoMode && !serialConnected && (
                <span className="text-muted-foreground hidden sm:inline">
                  · broker.hivemq.com
                </span>
              )}
              {serialConnected && (
                <span className="text-muted-foreground hidden sm:inline">
                  · Direct USB COM Port
                </span>
              )}
            </div>

            {/* USB Serial toggle */}
            <Button
              variant={serialConnected ? "default" : "outline"}
              size="sm"
              onClick={toggleSerialConnection}
              className="gap-1.5"
            >
              <FiZap className="size-3.5" />
              {serialConnected ? "Disconnect USB" : "Connect USB"}
            </Button>

            {/* Demo toggle */}
            <Button
              variant={demoMode ? "default" : "outline"}
              size="sm"
              onClick={() => setDemoMode((v) => !v)}
              className="gap-1.5"
            >
              <FiRadio className="size-3.5" />
              {demoMode ? "Exit Demo" : "Demo Mode"}
            </Button>
          </div>
        </header>

        {/* ── STATUS BANNER ───────────────────────────────────────────── */}
        <section
          className={cn(
            "rounded-3xl border p-5 md:p-6 transition-all duration-500",
            cfg.bannerBg,
            cfg.bannerBorder,
            "ring-2",
            cfg.ringColor
          )}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                System Status
              </p>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-xl",
                    cfg.accentText,
                    "bg-current/10"
                  )}
                >
                  <span className={cfg.accentText}>{cfg.icon}</span>
                </span>
                <h2 className={cn("text-xl font-bold", cfg.accentText)}>
                  {cfg.label}
                </h2>
                {data?.manualTrigger === 1 && (
                  <Badge variant="destructive" className="text-[10px]">
                    MANUAL OVERRIDE
                  </Badge>
                )}
              </div>
              <p className="max-w-lg text-sm text-muted-foreground leading-relaxed">
                {cfg.description}
              </p>
            </div>

            <div className="flex gap-2 shrink-0">
              <Button
                variant="destructive"
                size="default"
                disabled={data?.manualTrigger === 1}
                onClick={() => {
                  if (demoMode) {
                    setDemo((p) => ({ ...p, manualTrigger: 1, status: 3 }));
                  } else if (serialConnected) {
                    sendSerialCommand({ command: "banjir" });
                  } else {
                    publishControl("banjir");
                  }
                }}
                className="gap-2"
              >
                <FiZap className="size-4" />
                Trigger Alarm
              </Button>
              <Button
                variant="outline"
                size="default"
                disabled={data?.manualTrigger === 0}
                onClick={() => {
                  if (demoMode) {
                    setDemo((p) => {
                      const wT = p.warningThreshold ?? 35;
                      const dT = p.dangerThreshold ?? 20;
                      return {
                        ...p,
                        manualTrigger: 0,
                        status:
                          p.waterLevel < dT
                            ? 3
                            : p.waterLevel < wT
                            ? 2
                            : p.rainDigital === 1
                            ? 1
                            : 0,
                      };
                    });
                  } else if (serialConnected) {
                    sendSerialCommand({ command: "normal" });
                  } else {
                    publishControl("normal");
                  }
                }}
                className="gap-2"
              >
                <FiRefreshCw className="size-4" />
                Reset
              </Button>
            </div>
          </div>
        </section>

        {/* ── MAIN GRID ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT: sensor cards + water level */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Emergency Alerts & Recommended Actions */}
            <EmergencyHub status={status} />

            {/* Water level + key metrics row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Water Level Visual */}
              <Card className="sm:col-span-1 row-span-1">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <FiDroplet className="size-4 text-primary" />
                    <CardTitle>Water Level</CardTitle>
                  </div>
                  <CardDescription>JSN-SR04T Ultrasonic</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center gap-5 py-2">
                  {/* Tank */}
                  <div className="relative w-14 h-40 rounded-2xl border border-border bg-muted/30 overflow-hidden flex items-end">
                    {/* fill */}
                    <div
                      className={cn(
                        "w-full rounded-b-2xl transition-all duration-1000 ease-out bg-gradient-to-t",
                        cfg.tankColor,
                        status === 3 && "animate-pulse"
                      )}
                      style={{ height: `${fillPct}%` }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/25 rounded-t-full animate-wave" />
                    </div>
                    {/* tick marks */}
                    {[dangerThreshold, warningThreshold, MAX_SENSOR_DISTANCE].map((mark) => {
                      const pct = ((MAX_SENSOR_DISTANCE - mark) / MAX_SENSOR_DISTANCE) * 100;
                      const isDanger = mark === dangerThreshold;
                      const isWarning = mark === warningThreshold;
                      const label = isDanger ? "DANG" : isWarning ? "WARN" : "MAX";
                      const color = isDanger
                        ? "border-red-500/40 text-red-400"
                        : isWarning
                        ? "border-orange-500/40 text-orange-400"
                        : "border-white/15 text-white/40";
                      return (
                        <div
                          key={mark}
                          className={cn(
                            "absolute left-0 right-0 border-t border-dashed text-[7px] font-mono pl-1 font-bold select-none",
                            color
                          )}
                          style={{ bottom: `${pct}%` }}
                        >
                          {label}
                        </div>
                      );
                    })}
                  </div>

                  {/* Numbers */}
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Height</span>
                    <span
                      className={cn(
                        "text-3xl font-bold tabular-nums",
                        cfg.accentText
                      )}
                    >
                      {waterHeight.toFixed(1)}
                    </span>
                    <span className="text-sm text-muted-foreground">cm</span>
                    <Separator className="my-2" />
                    <span className="text-xs text-muted-foreground">Dist.</span>
                    <span className="text-lg font-semibold tabular-nums text-foreground">
                      {data ? data.waterLevel : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">cm</span>
                    <Progress
                      value={fillPct}
                      className="mt-3 h-1.5"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Key stats 2×2 */}
              <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                <StatCard
                  icon={<FiThermometer className="size-4" />}
                  label="Water Temp"
                  value={data ? data.waterTemp.toFixed(1) : "—"}
                  unit="°C"
                  accentClass="text-sky-400"
                  sub="DS18B20 sensor"
                />
                <StatCard
                  icon={<FiNavigation className="size-4" />}
                  label="TDS"
                  value={data ? data.tds.toString() : "—"}
                  unit="ppm"
                  accentClass={
                    data && data.tds > 400 ? "text-destructive" : "text-teal-400"
                  }
                  sub={data && data.tds > 400 ? "Impure / Dirty" : "Pure / Potable"}
                />
                <StatCard
                  icon={<FiEye className="size-4" />}
                  label="Turbidity"
                  value={data ? data.turbidity.toFixed(1) : "—"}
                  unit="NTU"
                  accentClass={
                    data && data.turbidity > 150
                      ? "text-yellow-400"
                      : "text-indigo-400"
                  }
                  sub={data && data.turbidity > 150 ? "Turbid" : "Clear"}
                />
                <StatCard
                  icon={<FiActivity className="size-4" />}
                  label="Flow Rate"
                  value={data ? data.flowRate.toFixed(2) : "—"}
                  unit="L/min"
                  accentClass="text-cyan-400"
                  sub={`Total: ${data ? data.totalLiters.toFixed(2) : "0"} L`}
                />
              </div>
            </div>

            {/* Weather strip */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FiSun className="size-4 text-amber-400" />
                  <CardTitle>Weather & Atmosphere</CardTitle>
                </div>
                <CardDescription>BME280 Sensor + MH-RD Rain Detector</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FiThermometer className="size-3 text-orange-400" /> Air Temp
                    </span>
                    <span className="text-xl font-bold text-orange-400 tabular-nums">
                      {data ? data.airTemp.toFixed(1) : "—"}°C
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FiWind className="size-3 text-blue-400" /> Humidity
                    </span>
                    <span className="text-xl font-bold text-blue-400 tabular-nums">
                      {data ? data.airHum : "—"}%
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FiTrendingUp className="size-3 text-violet-400" /> Pressure
                    </span>
                    <span className="text-xl font-bold text-violet-400 tabular-nums">
                      {data ? data.airPress.toFixed(0) : "—"}
                      <span className="text-xs font-normal ml-0.5 text-muted-foreground">hPa</span>
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FiCloudRain className="size-3 text-sky-400" /> Rain Status
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={cn(
                          "size-2.5 rounded-full",
                          data?.rainDigital === 1
                            ? "bg-sky-400 animate-pulse"
                            : "bg-muted-foreground/40"
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          data?.rainDigital === 1
                            ? "text-sky-400"
                            : "text-muted-foreground"
                        )}
                      >
                        {data?.rainDigital === 1 ? "Raining" : "Dry"}
                      </span>
                    </div>
                    {data && (
                      <Progress
                        value={100 - ((data.rainAnalog / 4095) * 100)}
                        className="h-1 mt-1"
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: camera + logs + info */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {/* Camera card */}
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FiCamera className="size-4 text-sky-400" />
                  <CardTitle>Flood Camera Status</CardTitle>
                </div>
                <CardAction>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Virtual Feed
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative aspect-video overflow-hidden bg-muted group">
                  <img
                    src={
                      status === 3 
                        ? "/cam/danger.jpg" 
                        : status === 2 
                        ? "/cam/warning.jpg" 
                        : "/cam/normal.jpg"
                    }
                    alt="Flood status dummy feed"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-85"
                  />
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 flex flex-col justify-between p-3">
                    <div className="flex justify-between items-start">
                      <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] font-mono text-sky-400 font-bold">
                        <span className="size-1.5 rounded-full bg-sky-400 animate-pulse" />
                        VIRTUAL FEED
                      </span>
                      <span className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] font-mono text-white/60">
                        Device IP: {data?.cameraIp && data.cameraIp !== "Offline" && !data.cameraIp.includes("Not Connected") ? data.cameraIp : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
                      <span className="text-[10px] font-mono text-white/70">
                        File: {status === 3 ? "danger.jpg" : status === 2 ? "warning.jpg" : "normal.jpg"}
                      </span>
                      <span className="text-[10px] font-mono text-white/50">
                        Status Mockup
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <div className="px-5 py-3 border-t border-border/40 bg-muted/10 text-[10px] text-muted-foreground leading-relaxed font-sans">
                ℹ️ The physical ESP32-CAM is decommissioned. The dashboard displays safety status placeholder images (normal, warning, danger) based on real-time sensor fusion status.
              </div>
            </Card>


            {/* Activity log */}
            <Card className="flex flex-col flex-1 min-h-0">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FiDatabase className="size-4 text-indigo-400" />
                  <CardTitle>System Log</CardTitle>
                </div>
                <CardAction>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Latest {logs.length}
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto max-h-56 flex flex-col gap-2.5">
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8 font-mono">
                    No events yet. Connect device or enable Demo.
                  </p>
                ) : (
                  logs.map((l) => (
                    <LogEntry
                      key={l.id}
                      type={l.type}
                      time={l.time}
                      message={l.message}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            {/* Threshold Settings Card */}
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FiSettings className="size-4 text-primary" />
                  <CardTitle>Water Level Thresholds</CardTitle>
                </div>
                <CardDescription>Adjust warning and danger trigger distances (cm)</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="text-foreground font-medium flex justify-between font-sans">
                    <span>Warning Threshold</span>
                    <span className="text-[10px] text-muted-foreground font-mono">default: 35cm</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={warningInput}
                      onChange={(e) => setWarningInput(e.target.value)}
                      placeholder="e.g. 35"
                      className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono focus:outline-none focus:border-primary/50"
                    />
                    <span className="absolute right-3 top-2 text-muted-foreground text-[10px] font-mono">cm</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-foreground font-medium flex justify-between font-sans">
                    <span>Danger Threshold</span>
                    <span className="text-[10px] text-muted-foreground font-mono">default: 20cm</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={dangerInput}
                      onChange={(e) => setDangerInput(e.target.value)}
                      placeholder="e.g. 20"
                      className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono focus:outline-none focus:border-primary/50"
                    />
                    <span className="absolute right-3 top-2 text-muted-foreground text-[10px] font-mono">cm</span>
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    const w = parseFloat(warningInput);
                    const d = parseFloat(dangerInput);
                    if (isNaN(w) || isNaN(d) || w <= 0 || d <= 0) {
                      alert("Please enter valid positive numbers for thresholds.");
                      return;
                    }
                    if (d >= w) {
                      alert("Danger threshold must be lower than Warning threshold.");
                      return;
                    }
                    if (demoMode) {
                      setDemo((p) => ({
                        ...p,
                        warningThreshold: w,
                        dangerThreshold: d,
                        status: p.waterLevel < d ? 3 : p.waterLevel < w ? 2 : 0,
                      }));
                      alert("Demo mode thresholds updated local state!");
                    } else if (serialConnected) {
                      sendSerialCommand({ command: "set_thresholds", warning: w, danger: d });
                    } else {
                      publishThresholds(w, d);
                    }
                  }}
                  className="w-full mt-1.5 gap-1.5 cursor-pointer"
                >
                  <FiSettings className="size-3.5" />
                  Save Thresholds
                </Button>
              </CardContent>
            </Card>

            {/* WiFi Settings Card */}
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FiWifi className="size-4 text-primary" />
                  <CardTitle>Device Wi-Fi Settings</CardTitle>
                </div>
                <CardDescription>Configure the main ESP32 Wi-Fi credentials</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="text-foreground font-medium font-sans">SSID / Wi-Fi Name</label>
                  <input
                    type="text"
                    value={wifiSsidInput}
                    onChange={(e) => setWifiSsidInput(e.target.value)}
                    placeholder="e.g. MyWiFiNetwork"
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-foreground font-medium font-sans">Password</label>
                  <input
                    type="password"
                    value={wifiPasswordInput}
                    onChange={(e) => setWifiPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono focus:outline-none focus:border-primary/50"
                  />
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (!wifiSsidInput) {
                      alert("Please enter a Wi-Fi SSID.");
                      return;
                    }
                    if (confirm("Changing Wi-Fi settings will reboot the ESP32 to connect. Proceed?")) {
                      if (demoMode) {
                        alert("Demo mode: Wi-Fi credentials simulated.");
                      } else if (serialConnected) {
                        sendSerialCommand({ command: "set_wifi", ssid: wifiSsidInput, pass: wifiPasswordInput });
                      } else {
                        publishWifiSettings(wifiSsidInput, wifiPasswordInput);
                      }
                    }
                  }}
                  className="w-full mt-1.5 gap-1.5 cursor-pointer"
                >
                  <FiSettings className="size-3.5" />
                  Save Wi-Fi & Reboot
                </Button>
              </CardContent>
            </Card>

            {/* Info card */}
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FiWifi className="size-4 text-primary" />
                  <CardTitle>Device Info</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                  {[
                    ["Broker", "broker.hivemq.com"],
                    ["Port (WS)", "8000 / WSS: 8884"],
                    ["Status Topic", "custos_aquae/device_1/status"],
                    ["Control Topic", "custos_aquae/device_1/control"],
                    ["Sensors", "JSN-SR04T · DS18B20 · BME280"],
                    ["Other", "TDS · Turbidity · YF-S401"],
                  ].map(([k, v]) => (
                    <React.Fragment key={k}>
                      <span className="text-foreground font-medium">{k}</span>
                      <span className="font-mono truncate" title={v}>{v}</span>
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <footer className="flex flex-col gap-1 sm:flex-row sm:justify-between items-center border-t border-border pt-5 text-xs text-muted-foreground">
          <span>
            Custos Aquae Dashboard © 2026 · Made by{" "}
            <a
              href="https://mja.moe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Moehammad Joesoef Aldri
            </a>
          </span>
          <span className="font-mono">
            MQTT · ESP32 · Next.js 16 · shadcn/ui
          </span>
        </footer>
      </div>
    </div>
  );
}
