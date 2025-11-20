
import { Card, CardColor, CardValue, GameState, Player } from '../types';
import { CARD_COLORS, CARD_VALUES, INITIAL_HAND_SIZE } from '../constants';

// Generate a unique ID
const uid = () => Math.random().toString(36).substr(2, 9);

export const createDeck = (): Card[] => {
  let deck: Card[] = [];

  CARD_COLORS.forEach(color => {
    // One zero per color
    deck.push({ id: uid(), color, value: CardValue.Zero });

    // Two of 1-9, Skip, Reverse, Draw2 per color
    for (let i = 0; i < 2; i++) {
      [
        CardValue.One, CardValue.Two, CardValue.Three, CardValue.Four, 
        CardValue.Five, CardValue.Six, CardValue.Seven, CardValue.Eight, CardValue.Nine,
        CardValue.Skip, CardValue.Reverse, CardValue.DrawTwo
      ].forEach(value => {
        deck.push({ id: uid(), color, value });
      });
    }
  });

  // 4 Wilds, 4 Wild Draw 4s
  for (let i = 0; i < 4; i++) {
    deck.push({ id: uid(), color: CardColor.Black, value: CardValue.Wild });
    deck.push({ id: uid(), color: CardColor.Black, value: CardValue.WildDrawFour });
  }

  return shuffleDeck(deck);
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const isCardPlayable = (card: Card, topCard: Card, currentColor: CardColor, drawStack: number): boolean => {
  // Stacking Logic Rule:
  // If there is a draw stack (>0), you MUST play a card that stacks.
  if (drawStack > 0) {
    // +2 on +2: Allowed
    if (topCard.value === CardValue.DrawTwo) {
        // Can play +2
        if (card.value === CardValue.DrawTwo) return true;
        // Can play +4 ("+4可以与之前的+2叠加")
        if (card.value === CardValue.WildDrawFour) return true;
        return false;
    }
    
    // Stack on +4
    if (topCard.value === CardValue.WildDrawFour) {
        // Can play +4 ("+4可以与之后的+4叠加")
        if (card.value === CardValue.WildDrawFour) return true;
        // CANNOT play +2 ("不可与+2叠加")
        return false;
    }

    return false;
  }

  // Normal Logic
  // Wilds are always playable (unless restricted by house rules, but standard UNO allows)
  if (card.color === CardColor.Black) return true;

  // Match color
  if (card.color === currentColor) return true;

  // Match value
  if (card.value === topCard.value) return true;

  // Special case: If top card was a Wild (and had color set), we match that color. 
  if (topCard.color === CardColor.Black && topCard.tempColor === card.color) return true;

  return false;
};

export const getNextPlayerIndex = (current: number, direction: 1 | -1, playerCount: number) => {
  return (current + direction + playerCount) % playerCount;
};

export const drawCards = (deck: Card[], count: number): { drawn: Card[], remainingDeck: Card[] } => {
  const drawn = deck.slice(0, count);
  const remainingDeck = deck.slice(count);
  return { drawn, remainingDeck };
};
