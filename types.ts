
export enum CardColor {
  Red = 'red',
  Blue = 'blue',
  Green = 'green',
  Yellow = 'yellow',
  Black = 'black', // For Wild cards before color is chosen
}

export enum CardValue {
  Zero = '0',
  One = '1',
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Skip = 'skip',
  Reverse = 'reverse',
  DrawTwo = 'draw2',
  Wild = 'wild',
  WildDrawFour = 'wild_draw4',
}

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
  // The color effectively chosen if it's a wild card that has been played
  tempColor?: CardColor; 
}

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  hand: Card[];
  avatar: string;
  persona: string; // For Gemini API instructions
  hasCalledUno: boolean; // Track if they shouted UNO
  saidUnoThisTurn: boolean; // Reset every turn
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  players: Player[];
  currentPlayerIndex: number;
  direction: 1 | -1; // 1 for clockwise, -1 for counter-clockwise
  gameStatus: 'lobby' | 'dealing' | 'playing' | 'gameover' | 'color_selection' | 'challenge_chance';
  winner: Player | null;
  currentColor: CardColor; // The active color to match
  turnLog: string[];
  
  // New Rule States
  drawStack: number; // Accumulated penalty cards (+2 or +4)
  
  // Challenge State
  previousColor: CardColor | null; // The color on top BEFORE the +4 was played (for validation)
  pendingPlusFourSender: number | null; // Who played the +4
  
  unoCallCooldown: boolean; // Anti-spam for UNO button
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}
