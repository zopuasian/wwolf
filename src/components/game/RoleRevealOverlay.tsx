"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  WerewolfIcon,
  WhiteWolfKingIcon,
  SeerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
  VillagerIcon,
  IdiotIcon,
  NightIcon,
} from "@/components/icons/FlatIcons";
import { MULTIPLAYER_ROLE_LABEL } from "@/lib/multiplayer/roles";
import type { Phase, Player, Role } from "@/types/game";
import { useTranslations } from "next-intl";

interface RoleRevealOverlayProps {
  open: boolean;
  player: Player;
  phase: Phase;
  onContinue: () => void;
  mode?: "reveal" | "preview";
}

type RoleMeta = {
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  abilities: string[];
  tips: string[];
};

const expandedRoleMeta: Partial<Record<Role, Omit<RoleMeta, "title">>> = {
  BigBadWolf: {
    subtitle: "A senior wolf who turns tragedy into recruitment.",
    color: "var(--color-wolf)",
    bg: "var(--color-wolf-bg)",
    Icon: WerewolfIcon,
    abilities: [
      "Vote with the wolves at night.",
      "If any wolf dies while you are alive, the next wolf night recruits one non-wolf instead of biting.",
    ],
    tips: ["Stay alive long enough to unlock the recruit night.", "Pick a trusted recruit target with the pack."],
  },
  WolfCub: {
    subtitle: "A young wolf whose death enrages the pack.",
    color: "var(--color-wolf)",
    bg: "var(--color-wolf-bg)",
    Icon: WerewolfIcon,
    abilities: ["Vote with the wolves at night.", "If you die, the wolves gain a revenge night."],
    tips: ["Your survival matters, but your death can create a powerful swing.", "Coordinate openly with your wolf team at night."],
  },
  Sorcerer: {
    subtitle: "A wolf-aligned mystic searching for wolves and the Seer.",
    color: "var(--color-witch)",
    bg: "var(--color-witch-bg)",
    Icon: WitchIcon,
    abilities: ["Inspect one player at night.", "Your result can reveal wolf, Seer, or something else."],
    tips: ["Help wolves find the Seer without exposing yourself.", "You are on the wolf team, but you do not perform the bite."],
  },
  Diseased: {
    subtitle: "A villager the wolves will regret killing.",
    color: "var(--color-villager)",
    bg: "var(--color-villager-bg)",
    Icon: VillagerIcon,
    abilities: ["You play with the village.", "If wolves kill you at night, their next attack is blocked."],
    tips: ["Draw attention carefully if you want to waste a wolf night.", "Your vote is still your main weapon by day."],
  },
  Prince: {
    subtitle: "A revealed noble who survives the first execution.",
    color: "var(--color-villager)",
    bg: "var(--color-villager-bg)",
    Icon: VillagerIcon,
    abilities: ["You play with the village.", "If voted out, your role is revealed and you survive instead."],
    tips: ["Use your reveal to become a trusted voice.", "Do not waste the protection too early if you can avoid it."],
  },
  Cupid: {
    subtitle: "A matchmaker who binds two players together.",
    color: "var(--color-witch)",
    bg: "var(--color-witch-bg)",
    Icon: WitchIcon,
    abilities: ["On the first night, choose two lovers.", "If one lover dies, the other dies with them."],
    tips: ["A mixed village-wolf pair can change the whole game.", "Choose carefully; the link lasts all game."],
  },
  PI: {
    subtitle: "An investigator who checks a small neighborhood.",
    color: "var(--color-seer)",
    bg: "var(--color-seer-bg)",
    Icon: SeerIcon,
    abilities: ["Choose a center player at night.", "You learn whether that player and their neighbors include suspicious roles."],
    tips: ["Use your result to narrow groups, not hard-confirm one person.", "Lycan and wolf-aligned roles can affect suspicion."],
  },
  Lycan: {
    subtitle: "A villager who looks suspicious to investigators.",
    color: "var(--color-villager)",
    bg: "var(--color-villager-bg)",
    Icon: VillagerIcon,
    abilities: ["You play with the village.", "Investigation-style checks can make you look evil."],
    tips: ["Expect messy information around you.", "Your strongest tool is consistent day discussion."],
  },
  Cursed: {
    subtitle: "A villager who can be turned by the wolves.",
    color: "var(--color-villager)",
    bg: "var(--color-villager-bg)",
    Icon: VillagerIcon,
    abilities: ["You start on the village team.", "If wolves attack you at night, you become a Werewolf instead of dying."],
    tips: ["Your team can change without the village knowing.", "After turning, coordinate with the wolves at night."],
  },
  Doppelganger: {
    subtitle: "A watcher waiting to inherit another destiny.",
    color: "var(--color-villager)",
    bg: "var(--color-villager-bg)",
    Icon: IdiotIcon,
    abilities: ["On the first night, choose one player to copy.", "If that player dies, you inherit their role."],
    tips: ["Pick a role you can play well later.", "Until your target dies, your day play matters most."],
  },
  Tanner: {
    subtitle: "A lone role who wants to be executed.",
    color: "var(--color-hunter)",
    bg: "var(--color-hunter-bg)",
    Icon: HunterIcon,
    abilities: ["You do not win with village or wolves.", "You win if the village votes you out."],
    tips: ["Look suspicious enough to be executed, but not so obvious that players avoid you.", "Night deaths do not give you the win."],
  },
  CultLeader: {
    subtitle: "A recruiter building a hidden faction.",
    color: "var(--color-witch)",
    bg: "var(--color-witch-bg)",
    Icon: WitchIcon,
    abilities: ["Recruit one player at night.", "The cult wins if all living players become cult members."],
    tips: ["Recruit players who are likely to survive.", "Keep the cult hidden until it can control the table."],
  },
};

function getExpandedRoleMeta(role: Role): RoleMeta | null {
  const meta = expandedRoleMeta[role];
  return meta ? { ...meta, title: MULTIPLAYER_ROLE_LABEL[role] } : null;
}

function getRoleMeta(role: Player["role"], t: ReturnType<typeof useTranslations>): RoleMeta {
  switch (role) {
    case "Werewolf":
      return {
        title: t("roleReveal.roles.werewolf.title"),
        subtitle: t("roleReveal.roles.werewolf.subtitle"),
        color: "var(--color-wolf)",
        bg: "var(--color-wolf-bg)",
        Icon: WerewolfIcon,
        abilities: t.raw("roleReveal.roles.werewolf.abilities"),
        tips: t.raw("roleReveal.roles.werewolf.tips"),
      };
    case "Seer":
      return {
        title: t("roleReveal.roles.seer.title"),
        subtitle: t("roleReveal.roles.seer.subtitle"),
        color: "var(--color-seer)",
        bg: "var(--color-seer-bg)",
        Icon: SeerIcon,
        abilities: t.raw("roleReveal.roles.seer.abilities"),
        tips: t.raw("roleReveal.roles.seer.tips"),
      };
    case "Witch":
      return {
        title: t("roleReveal.roles.witch.title"),
        subtitle: t("roleReveal.roles.witch.subtitle"),
        color: "var(--color-witch)",
        bg: "var(--color-witch-bg)",
        Icon: WitchIcon,
        abilities: t.raw("roleReveal.roles.witch.abilities"),
        tips: t.raw("roleReveal.roles.witch.tips"),
      };
    case "Hunter":
      return {
        title: t("roleReveal.roles.hunter.title"),
        subtitle: t("roleReveal.roles.hunter.subtitle"),
        color: "var(--color-hunter)",
        bg: "var(--color-hunter-bg)",
        Icon: HunterIcon,
        abilities: t.raw("roleReveal.roles.hunter.abilities"),
        tips: t.raw("roleReveal.roles.hunter.tips"),
      };
    case "Guard":
      return {
        title: t("roleReveal.roles.guard.title"),
        subtitle: t("roleReveal.roles.guard.subtitle"),
        color: "var(--color-guard)",
        bg: "var(--color-guard-bg)",
        Icon: GuardIcon,
        abilities: t.raw("roleReveal.roles.guard.abilities"),
        tips: t.raw("roleReveal.roles.guard.tips"),
      };
    case "Idiot":
      return {
        title: t("roleReveal.roles.idiot.title"),
        subtitle: t("roleReveal.roles.idiot.subtitle"),
        color: "var(--color-villager)",
        bg: "var(--color-villager-bg)",
        Icon: IdiotIcon,
        abilities: t.raw("roleReveal.roles.idiot.abilities"),
        tips: t.raw("roleReveal.roles.idiot.tips"),
      };
    case "WhiteWolfKing":
      return {
        title: t("roleReveal.roles.whiteWolfKing.title"),
        subtitle: t("roleReveal.roles.whiteWolfKing.subtitle"),
        color: "var(--color-wolf)",
        bg: "var(--color-wolf-bg)",
        Icon: WhiteWolfKingIcon,
        abilities: t.raw("roleReveal.roles.whiteWolfKing.abilities"),
        tips: t.raw("roleReveal.roles.whiteWolfKing.tips"),
      };
    default:
      if (role !== "Villager") {
        const expandedMeta = getExpandedRoleMeta(role);
        if (expandedMeta) return expandedMeta;
      }
      return {
        title: t("roleReveal.roles.villager.title"),
        subtitle: t("roleReveal.roles.villager.subtitle"),
        color: "var(--color-villager)",
        bg: "var(--color-villager-bg)",
        Icon: VillagerIcon,
        abilities: t.raw("roleReveal.roles.villager.abilities"),
        tips: t.raw("roleReveal.roles.villager.tips"),
      };
  }
}

function getNextStepText(role: Player["role"], phase: Phase, t: ReturnType<typeof useTranslations>) {
  if (phase === "NIGHT_START") {
    switch (role) {
      case "Werewolf":
        return t("roleReveal.nextStep.werewolf");
      case "WhiteWolfKing":
        return t("roleReveal.nextStep.whiteWolfKing");
      case "Seer":
        return t("roleReveal.nextStep.seer");
      case "Witch":
        return t("roleReveal.nextStep.witch");
      case "Guard":
        return t("roleReveal.nextStep.guard");
      case "Hunter":
        return t("roleReveal.nextStep.hunter");
      case "Idiot":
        return t("roleReveal.nextStep.idiot");
      default:
        return t("roleReveal.nextStep.villager");
    }
  }

  return t("roleReveal.nextStep.default");
}

export function RoleRevealOverlay({ open, player, phase, onContinue, mode = "reveal" }: RoleRevealOverlayProps) {
  const t = useTranslations();
  const meta = getRoleMeta(player.role, t);
  const NextStepIcon = NightIcon;

  const isPreview = mode === "preview";
  const isNight = !isPreview && phase.includes("NIGHT");

  const [revealed, setRevealed] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setRevealed(false));
    const t = window.setTimeout(() => setRevealed(true), 650);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => () => {
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
  }, []);

  const handleContinue = () => {
    if (!isPreview) {
      onContinue();
      return;
    }

    setClosing(true);
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onContinue();
    }, 240);
  };

  const cardAccent = useMemo(() => meta.color, [meta.color]);
  const previewOverlayBackground =
    "radial-gradient(circle at 50% 38%, rgba(255,248,236,0.70) 0%, rgba(229,216,196,0.62) 48%, rgba(67,58,47,0.30) 100%)";
  const darkOverlayBackground =
    "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.78) 55%, rgba(0,0,0,0.92) 100%)";
  const previewFaceBackground =
    "linear-gradient(135deg, rgba(252,246,233,0.98) 0%, rgba(239,226,202,0.96) 62%, rgba(224,205,171,0.92) 100%)";
  const darkFaceBackground = isNight
    ? `linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.26) 100%), linear-gradient(135deg, ${meta.bg} 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.12) 100%)`
    : `linear-gradient(135deg, ${meta.bg} 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.12) 100%)`;
  const labelColor = isPreview ? "rgba(151, 111, 55, 0.88)" : "rgba(255,255,255,0.60)";
  const primaryTextColor = isPreview ? "var(--text-primary)" : "rgba(255,255,255,0.96)";
  const secondaryTextColor = isPreview ? "var(--text-secondary)" : "rgba(255,255,255,0.72)";
  const panelBackground = isPreview ? "rgba(255, 251, 242, 0.64)" : "rgba(0,0,0,0.20)";
  const panelBorder = isPreview ? "1px solid rgba(197, 160, 89, 0.24)" : "1px solid rgba(255,255,255,0.08)";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="role-reveal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={[
            "fixed inset-0 z-[60] flex items-center justify-center wc-role-reveal-overlay",
            isPreview ? "wc-role-reveal-overlay--preview" : "",
          ].filter(Boolean).join(" ")}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: closing ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: closing ? 0.24 : 0.25 }}
            style={{ background: isPreview ? previewOverlayBackground : darkOverlayBackground }}
          />

          <div className="relative w-full max-w-[680px] px-6 wc-role-reveal-card">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: closing ? 0 : 1, y: closing ? -10 : 0, scale: closing ? 0.965 : 1, filter: closing ? "blur(2px)" : "blur(0px)" }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={closing ? { duration: 0.22, ease: "easeInOut" } : { type: "spring", stiffness: 420, damping: 34 }}
              className={[
                "rounded-2xl p-1",
                isPreview ? "wc-role-reveal-shell--preview" : "glass-panel glass-panel--strong",
              ].join(" ")}
              style={isPreview ? {
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(197,160,89,0.32)",
                boxShadow: "0 26px 70px rgba(80, 62, 42, 0.26), 0 0 0 1px rgba(255,255,255,0.66) inset",
              } : undefined}
            >
              <div className="rounded-2xl overflow-hidden" style={{ perspective: 1200 }}>
                <motion.div
                  initial={false}
                  animate={{ rotateY: revealed ? 0 : 180 }}
                  transition={{ duration: 0.7, ease: "easeInOut" }}
                  className="relative"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                    <div
                      className="px-6 pt-7 pb-6"
                      style={{
                        background: isPreview
                          ? previewFaceBackground
                          : "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.25) 100%)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold tracking-wider uppercase" style={{ color: labelColor }}>{t("roleReveal.cardTitle")}</div>
                        <div className="text-xs" style={{ color: secondaryTextColor }}>{t("roleReveal.cardHint")}</div>
                      </div>
                      <div className="mt-6 flex items-center justify-center">
                        <motion.div
                          animate={{ rotate: [0, 4, -4, 0], scale: [1, 1.02, 1] }}
                          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                          className="w-40 h-56 rounded-3xl flex flex-col items-center justify-center gap-3"
                          style={{
                            background: isPreview ? "rgba(255,251,242,0.70)" : "rgba(0,0,0,0.28)",
                            border: isPreview ? "1px solid rgba(197,160,89,0.28)" : "1px solid rgba(255,255,255,0.12)",
                            boxShadow: isPreview
                              ? "0 12px 40px rgba(80,62,42,0.16), 0 0 0 1px rgba(255,255,255,0.54) inset"
                              : "0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset",
                          }}
                        >
                          <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{
                              background: isPreview ? "rgba(197,160,89,0.10)" : "rgba(255,255,255,0.06)",
                              border: isPreview ? "1px solid rgba(197,160,89,0.24)" : "1px solid rgba(255,255,255,0.10)",
                            }}
                          >
                            <meta.Icon size={28} className={isPreview ? "text-[#4a3529]" : "text-white/90"} />
                          </div>
                          <div className="text-sm font-bold" style={{ color: primaryTextColor }}>{t("roleReveal.dealing.title")}</div>
                          <div className="text-xs" style={{ color: secondaryTextColor }}>{t("roleReveal.dealing.subtitle")}</div>
                        </motion.div>
                      </div>
                      <div className="mt-6 text-center text-sm" style={{ color: secondaryTextColor }}>{t("roleReveal.dealing.footer")}</div>
                    </div>
                  </div>

                  <div className="relative" style={{ backfaceVisibility: "hidden" }}>
                    <div
                      className="px-6 pt-7 pb-5"
                      style={{ background: isPreview ? previewFaceBackground : darkFaceBackground }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-bold tracking-wider uppercase" style={{ color: labelColor }}>
                            {isPreview ? "Role guide" : t("roleReveal.identityLabel")}
                          </div>
                          <div className="mt-1 flex items-center gap-3">
                            <div
                              className="w-12 h-12 rounded-2xl flex items-center justify-center"
                              style={{
                                background: isPreview ? "rgba(255,251,242,0.72)" : "rgba(0,0,0,0.25)",
                                border: isPreview ? "1px solid rgba(197,160,89,0.28)" : "1px solid rgba(255,255,255,0.10)",
                                boxShadow: isPreview
                                  ? "0 0 0 1px rgba(255,255,255,0.50) inset, 0 10px 28px rgba(80,62,42,0.14)"
                                  : "0 0 0 1px rgba(255,255,255,0.04) inset, 0 10px 30px rgba(0,0,0,0.35)",
                              }}
                            >
                              <meta.Icon size={24} className={isPreview ? "text-[#4a3529]" : "text-white"} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-2xl font-black tracking-tight font-serif" style={{ color: primaryTextColor }}>
                                {meta.title}
                              </div>
                              <div className="mt-1 text-sm leading-relaxed" style={{ color: secondaryTextColor }}>{meta.subtitle}</div>
                            </div>
                          </div>
                        </div>

                        {isPreview ? (
                          <div className="shrink-0 text-right">
                            <div className="text-xs" style={{ color: secondaryTextColor }}>Lobby</div>
                            <div className="text-sm font-semibold" style={{ color: primaryTextColor }}>Preview</div>
                          </div>
                        ) : (
                          <div className="shrink-0 text-right">
                            <div className="text-xs text-white/55">{t("voteResult.seatLabel", { seat: player.seat + 1 })}</div>
                            <div className="text-sm font-semibold text-white/80">{player.displayName}</div>
                          </div>
                        )}
                      </div>

                      <motion.div
                        className="mt-6 h-px w-full"
                        initial={{ opacity: 0, scaleX: 0.85 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: 0.1 }}
                        style={{
                          background: isPreview
                            ? "linear-gradient(90deg, transparent, rgba(197,160,89,0.34), transparent)"
                            : "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
                        }}
                      />

                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl p-4" style={{ background: panelBackground, border: panelBorder }}>
                          <div className="text-xs font-bold tracking-wider uppercase" style={{ color: labelColor }}>{t("roleReveal.abilitiesLabel")}</div>
                          <div className="mt-2 space-y-2">
                            {meta.abilities.map((t, i) => (
                              <div key={i} className="text-sm leading-relaxed" style={{ color: secondaryTextColor }}>
                                {t}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl p-4" style={{ background: panelBackground, border: panelBorder }}>
                          <div className="text-xs font-bold tracking-wider uppercase" style={{ color: labelColor }}>{t("roleReveal.tipsLabel")}</div>
                          <div className="mt-2 space-y-2">
                            {meta.tips.map((t, i) => (
                              <div key={i} className="text-sm leading-relaxed" style={{ color: secondaryTextColor }}>
                                {t}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 py-5" style={{ background: isPreview ? "rgba(238, 226, 203, 0.72)" : "rgba(0,0,0,0.25)" }}>
                      <div className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{
                            background: isPreview ? "rgba(255,251,242,0.68)" : "rgba(255,255,255,0.05)",
                            border: isPreview ? "1px solid rgba(197,160,89,0.24)" : "1px solid rgba(255,255,255,0.10)",
                            color: isPreview ? "var(--text-primary)" : "rgba(255,255,255,0.80)",
                          }}
                        >
                          <NextStepIcon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold tracking-wider uppercase" style={{ color: labelColor }}>{t("roleReveal.nextLabel")}</div>
                          <div className="mt-1 text-sm leading-relaxed" style={{ color: secondaryTextColor }}>
                            {isPreview ? "Read this before the game starts, then close the guide." : getNextStepText(player.role, phase, t)}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <motion.button
                            type="button"
                            onClick={handleContinue}
                            disabled={closing}
                            whileTap={isPreview ? { scale: 0.93, rotate: -1 } : { scale: 0.98 }}
                            className="inline-flex items-center justify-center h-10 px-5 text-sm font-bold rounded-xl border-none cursor-pointer transition-all duration-150 bg-white text-black hover:bg-white/90 active:scale-[0.98]"
                            style={{
                              background: isPreview ? "var(--color-gold)" : "white",
                              color: isPreview ? "var(--text-primary)" : "black",
                              boxShadow: isPreview
                                ? "0 12px 26px rgba(197, 160, 89, 0.24), 0 0 0 1px rgba(126, 91, 45, 0.14) inset"
                                : `0 10px 30px rgba(0,0,0,0.35), 0 0 0 2px ${String(cardAccent)}22`,
                              opacity: closing ? 0.72 : 1,
                            }}
                          >
                            {isPreview ? "Close" : t("roleReveal.actions.continue")}
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
