"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import mqtt, { MqttClient } from "mqtt";

export interface SensorData {
  waterTemp: number;
  waterLevel: number; // Distance in cm (ultrasonic sensor value)
  tds: number;
  turbidity: number;
  flowRate: number;
  totalLiters: number;
  airTemp: number;
  airHum: number;
  airPress: number;
  rainAnalog: number;
  rainDigital: number; // 1 = Rain, 0 = Dry
  status: number; // 0=Safe, 1=Caution, 2=Warning, 3=Danger
  manualTrigger: number; // 1=Manual, 0=Automatic
  cameraIp: string;
  cameraStatus: string;
  warningThreshold?: number;
  dangerThreshold?: number;
  timestamp?: string;
}

export interface LogEntry {
  id: string;
  time: string;
  type: "info" | "warning" | "error" | "success";
  message: string;
}

const BROKER_URL_WS = "ws://broker.hivemq.com:8000/mqtt";
const BROKER_URL_WSS = "wss://broker.hivemq.com:8884/mqtt";
const PUB_TOPIC = "custos_aquae/device_1/control";
const SUB_TOPIC = "custos_aquae/device_1/status";
const IMG_TOPIC = "custos_aquae/device_1/image";

export function useMqtt() {
  const [client, setClient] = useState<MqttClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "disconnected" | "error">("disconnected");
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);


  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      type,
      message,
    };
    logsRef.current = [newLog, ...logsRef.current].slice(0, 50); // Keep last 50 logs
    setLogs([...logsRef.current]);
  }, []);

  useEffect(() => {
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const brokerUrl = isHttps ? BROKER_URL_WSS : BROKER_URL_WS;

    console.log(`[MQTT] Connecting to ${brokerUrl}...`);
    setConnectionStatus("connecting");
    addLog(`Connecting to MQTT broker (${isHttps ? "Secure WSS" : "WS"})...`, "info");

    const mqttClient = mqtt.connect(brokerUrl, {
      clientId: `custos_aquae_web_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
    });

    mqttClient.on("connect", () => {
      console.log("[MQTT] Connected to broker.");
      setConnectionStatus("connected");
      addLog("Connected to HiveMQ MQTT broker!", "success");
      
      mqttClient.subscribe(SUB_TOPIC, (err) => {
        if (!err) {
          addLog(`Subscribed to status topic: ${SUB_TOPIC}`, "info");
        } else {
          addLog(`Failed to subscribe to status topic: ${err.message}`, "error");
        }
      });

      mqttClient.subscribe(IMG_TOPIC, (err) => {
        if (!err) {
          addLog(`Subscribed to image topic: ${IMG_TOPIC}`, "info");
        } else {
          addLog(`Failed to subscribe to image topic: ${err.message}`, "error");
        }
      });
    });

    mqttClient.on("message", (topic, message) => {
      if (topic === SUB_TOPIC) {
        try {
          const payload = JSON.parse(message.toString()) as SensorData;
          payload.timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
          setSensorData(payload);

          // Generate logs based on status changes or thresholds
          const statusNames = ["SAFE", "CAUTION", "WARNING", "DANGER"];
          const currentStatusName = statusNames[payload.status] || "UNKNOWN";

          // Log safety status changes
          setSensorData((prev) => {
            if (prev && prev.status !== payload.status) {
              const prevStatusName = statusNames[prev.status] || "UNKNOWN";
              let logType: LogEntry["type"] = "info";
              if (payload.status === 3) logType = "error";
              else if (payload.status === 2) logType = "warning";
              else if (payload.status === 0) logType = "success";

              addLog(`System status changed from ${prevStatusName} to ${currentStatusName}`, logType);
            }
            return payload;
          });
        } catch (err) {
          console.error("[MQTT] Error parsing payload:", err);
        }
      } else if (topic === IMG_TOPIC) {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.image) {
            setCameraImage(payload.image);
            addLog("Received new camera frame via MQTT", "info");
          }
        } catch (err) {
          console.error("[MQTT] Error parsing image payload:", err);
        }
      }
    });

    mqttClient.on("error", (err) => {
      console.error("[MQTT] Connection error:", err);
      setConnectionStatus("error");
      addLog(`Connection error: ${err.message}`, "error");
    });

    mqttClient.on("offline", () => {
      setConnectionStatus("disconnected");
      addLog("MQTT connection offline. Reconnecting...", "warning");
    });

    setClient(mqttClient);

    return () => {
      if (mqttClient) {
        mqttClient.end();
      }
    };
  }, [addLog]);

  const publishControl = useCallback((command: "banjir" | "normal" | "capture") => {
    if (!client || connectionStatus !== "connected") {
      addLog("Failed to send command: Not connected to MQTT", "error");
      return;
    }
    const payload = JSON.stringify({ command });
    client.publish(PUB_TOPIC, payload, { qos: 1 }, (err) => {
      if (!err) {
        addLog(`Command '${command.toUpperCase()}' sent to device`, "success");
      } else {
        addLog(`Failed to send command: ${err.message}`, "error");
      }
    });
  }, [client, connectionStatus, addLog]);

  const publishThresholds = useCallback((warning: number, danger: number) => {
    if (!client || connectionStatus !== "connected") {
      addLog("Failed to send thresholds: Not connected to MQTT", "error");
      return;
    }
    const payload = JSON.stringify({ command: "set_thresholds", warning, danger });
    client.publish(PUB_TOPIC, payload, { qos: 1 }, (err) => {
      if (!err) {
        addLog(`Thresholds updated: Warning=${warning}cm, Danger=${danger}cm`, "success");
      } else {
        addLog(`Failed to send thresholds: ${err.message}`, "error");
      }
    });
  }, [client, connectionStatus, addLog]);

  const publishWifiSettings = useCallback((ssid: string, pass: string) => {
    if (!client || connectionStatus !== "connected") {
      addLog("Failed to send Wi-Fi settings: Not connected to MQTT", "error");
      return;
    }
    const payload = JSON.stringify({ command: "set_wifi", ssid, pass });
    client.publish(PUB_TOPIC, payload, { qos: 1 }, (err) => {
      if (!err) {
        addLog(`Wi-Fi settings sent: SSID=${ssid}. ESP32 will reboot.`, "success");
      } else {
        addLog(`Failed to send Wi-Fi settings: ${err.message}`, "error");
      }
    });
  }, [client, connectionStatus, addLog]);

  return {
    connectionStatus,
    sensorData,
    cameraImage,
    publishControl,
    publishThresholds,
    publishWifiSettings,
    logs,
  };
}
