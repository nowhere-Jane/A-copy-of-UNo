
import { CardColor, CardValue } from './types';

export const CARD_COLORS = [CardColor.Red, CardColor.Blue, CardColor.Green, CardColor.Yellow];
export const CARD_VALUES = [
  CardValue.Zero, CardValue.One, CardValue.Two, CardValue.Three, CardValue.Four, 
  CardValue.Five, CardValue.Six, CardValue.Seven, CardValue.Eight, CardValue.Nine,
  CardValue.Skip, CardValue.Reverse, CardValue.DrawTwo
];

export const BOT_PERSONAS = [
  {
    name: "闪电 (Flash)",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Flash",
    persona: "你是闪电，一个好胜且略带攻击性的UNO玩家。你喜欢赢，讨厌摸牌。用中文简短有力地回答。"
  },
  {
    name: "月神 (Luna)",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Luna",
    persona: "你是月神，一个随性且神秘的UNO玩家。你喜欢谈论运气和命运。用中文简短地回答。"
  },
  {
    name: "雷伏特 (Volt)",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Volt",
    persona: "你是雷伏特，一个机器人般的分析型UNO玩家。你计算概率，说话很技术性。用中文简短地回答。"
  }
];

export const INITIAL_HAND_SIZE = 7;
