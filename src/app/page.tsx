import { Suspense } from "react";
import { OnlineMultiplayerApp } from "@/components/multiplayer/OnlineMultiplayerApp";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <OnlineMultiplayerApp />
    </Suspense>
  );
}
