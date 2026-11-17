import {
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioSource,
} from "expo-audio";
import { useKeepAwake } from "expo-keep-awake";
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from "expo-network";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useRestaurantSession } from "../session";
import { OrderConsole } from "./console";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro registers the static sound as a native asset.
const ringingSound = require("./assets/new-order.wav") as AudioSource;

function WakeOrdersScreen() {
  useKeepAwake();
  return null;
}

function OrderAlert() {
  const player = useAudioPlayer(ringingSound);
  const { isLoaded } = useAudioPlayerStatus(player);
  useEffect(() => {
    if (!isLoaded) return;
    player.loop = true;
    player.play();
  }, [isLoaded, player]);
  return null;
}

function isConnected(state: NetworkState) {
  return state.isInternetReachable ?? state.isConnected ?? true;
}

export function RestaurantOrders() {
  const session = useRestaurantSession();
  const [foreground, setForeground] = useState(
    () => AppState.currentState === null || AppState.currentState === "active",
  );
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);

  useEffect(() => {
    let sawEvent = false;
    let active = true;
    const listener = addNetworkStateListener((state) => {
      sawEvent = true;
      setConnected(isConnected(state));
    });
    void getNetworkStateAsync()
      .then((state) => {
        if (active && !sawEvent) setConnected(isConnected(state));
      })
      .catch(() => undefined);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);

  return (
    <>
      {foreground && <WakeOrdersScreen />}
      <OrderConsole
        key={session.restaurantId}
        role={session.role}
        mode={session.currencyDisplayMode}
        expireAfterSec={session.expireAfterSec}
        serverOffsetMs={session.serverOffsetMs}
        acceptingOrders={session.acceptingOrders}
        foreground={foreground}
        connected={connected}
        request={session.request}
        alert={<OrderAlert />}
      />
    </>
  );
}
