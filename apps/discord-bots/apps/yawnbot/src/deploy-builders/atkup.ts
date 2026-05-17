/**
 * /atkup 슬래시 빌더 — Unity 무료 에셋 (atkup-bot 흡수, TASK-YB-003).
 *
 * 서브커맨드:
 *   /atkup unity [force]  — Unity Publisher Sale 무료 에셋 즉시 전송
 *
 * (구 /atkup news = Hacker News 수동 — YB-036 에서 스케줄 news notifier 로 흡수·폐기.)
 */
import { SlashCommandBuilder, Locale } from 'discord.js';

const EN = Locale.EnglishUS;
const enUS = (s: string): Record<string, string> => ({ [EN]: s });

export const atkupCommandGroup = () =>
  new SlashCommandBuilder()
    .setName('atkup')
    .setDescription('Unity 무료 에셋 알림 (설정된 알림 채널로 전송)')
    .setDescriptionLocalizations(
      enUS('Unity free asset notifier (sends to configured channel)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unity')
        .setDescription('Unity Publisher Sale 무료 에셋을 확인하고 알림 채널에 보냅니다.')
        .setDescriptionLocalizations(
          enUS('Check Unity Publisher Sale free asset and send to notify channel'),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('force')
            .setDescription('같은 쿠폰이어도 강제로 다시 전송합니다.')
            .setDescriptionLocalizations(enUS('Force resend even if coupon was already sent'))
            .setRequired(false),
        ),
    );
