
import React, { useState, useEffect, useRef } from 'react';
import { UnoCard } from './components/UnoCard';
import { Card, CardColor, CardValue, Player, GameState, ChatMessage } from './types';
import { createDeck, isCardPlayable, getNextPlayerIndex, drawCards, shuffleDeck } from './utils/gameLogic';
import { BOT_PERSONAS, INITIAL_HAND_SIZE, CARD_COLORS } from './constants';
import { generateBotReaction } from './services/geminiService';
import { MessageCircle, AlertTriangle, ShieldAlert, Play, RotateCcw } from 'lucide-react';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    discardPile: [],
    players: [],
    currentPlayerIndex: 0,
    direction: 1,
    gameStatus: 'lobby',
    winner: null,
    currentColor: CardColor.Red, // Default, changes on deal
    turnLog: [],
    drawStack: 0,
    previousColor: null,
    pendingPlusFourSender: null,
    unoCallCooldown: false
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedWildColor, setSelectedWildColor] = useState<CardColor | null>(null);
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [animationState, setAnimationState] = useState<'idle' | 'dealing'>('idle');

  // Helper: Add message to chat
  const addLog = (text: string, sender: string = "系统") => {
    setChatMessages(prev => [...prev, { sender, text, timestamp: Date.now() }]);
    setGameState(prev => ({ ...prev, turnLog: [...prev.turnLog.slice(-4), text] }));
  };

  // Scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // --- GAME INITIALIZATION ---

  const startGame = () => {
    setAnimationState('dealing');
    setGameState(prev => ({ ...prev, gameStatus: 'dealing' }));
    
    // Initialize Bots
    const bots: Player[] = BOT_PERSONAS.map((bp, idx) => ({
      id: idx + 1,
      name: bp.name,
      isHuman: false,
      hand: [],
      avatar: bp.avatar,
      persona: bp.persona,
      hasCalledUno: false,
      saidUnoThisTurn: false
    }));

    // Initialize Human
    const human: Player = {
      id: 0,
      name: "你 (You)",
      isHuman: true,
      hand: [],
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=You",
      persona: "",
      hasCalledUno: false,
      saidUnoThisTurn: false
    };

    // Combine players
    const players = [human, ...bots];
    
    // Animation delay for dealing
    setTimeout(() => {
      const fullDeck = createDeck();
      const dealResult = drawCards(fullDeck, INITIAL_HAND_SIZE * 4);
      const deck = dealResult.remainingDeck;

      // Distribute hands
      players[0].hand = dealResult.drawn.slice(0, 7);
      players[1].hand = dealResult.drawn.slice(7, 14);
      players[2].hand = dealResult.drawn.slice(14, 21);
      players[3].hand = dealResult.drawn.slice(21, 28);

      // Initial Discard (ensure it's not a Wild Draw 4 for simplicity, or handle it)
      let firstCard = deck.pop()!;
      while (firstCard.value === CardValue.WildDrawFour) {
        deck.unshift(firstCard); // put back
        deck.sort(() => Math.random() - 0.5); // reshuffle
        firstCard = deck.pop()!;
      }
      
      // Handle initial card effects (simplified: if wild, pick red)
      const startColor = firstCard.color === CardColor.Black ? CardColor.Red : firstCard.color;

      setGameState({
        deck,
        discardPile: [firstCard],
        players,
        currentPlayerIndex: 0,
        direction: 1,
        gameStatus: 'playing',
        winner: null,
        currentColor: startColor,
        turnLog: ["游戏开始！牌已发好。"],
        drawStack: firstCard.value === CardValue.DrawTwo ? 2 : 0, // If first card is +2, first player faces stack
        previousColor: null,
        pendingPlusFourSender: null,
        unoCallCooldown: false
      });
      setAnimationState('idle');
      addLog("游戏开始！", "裁判");
    }, 2000);
  };

  // --- CORE GAME LOOP & AI ---

  useEffect(() => {
    if (gameState.gameStatus !== 'playing') return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    // If AI Turn
    if (!currentPlayer.isHuman) {
      const timer = setTimeout(() => {
        playAiTurn();
      }, 1500); // Slow down AI
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayerIndex, gameState.gameStatus, gameState.drawStack, gameState.pendingPlusFourSender]);

  // --- ACTIONS ---

  const drawCardAction = (playerIndex: number, count: number) => {
    setGameState(prev => {
      const { drawn, remainingDeck } = drawCards(prev.deck, count);
      
      // Reshuffle if needed (simplified: if deck low, just use discard)
      let newDeck = remainingDeck;
      if (newDeck.length < count) {
         // In a real game, reshuffle discard into deck. 
         // For this demo, we assume big deck or create new if empty
         newDeck = createDeck(); 
      }

      const newPlayers = [...prev.players];
      newPlayers[playerIndex] = {
        ...newPlayers[playerIndex],
        hand: [...newPlayers[playerIndex].hand, ...drawn],
        hasCalledUno: false // Reset UNO call on draw
      };

      // Log
      const playerName = newPlayers[playerIndex].name;
      addLog(`${playerName} 摸了 ${count} 张牌。`);

      return {
        ...prev,
        deck: newDeck,
        players: newPlayers,
        drawStack: 0 // Reset stack after drawing
      };
    });
  };

  const advanceTurn = (state: GameState, skip: boolean = false): GameState => {
    let nextIndex = getNextPlayerIndex(state.currentPlayerIndex, state.direction, 4);
    if (skip) {
      addLog(`${state.players[nextIndex].name} 被跳过了！`);
      nextIndex = getNextPlayerIndex(nextIndex, state.direction, 4);
    }
    
    // Reset turn-based flags for the new player
    const newPlayers = [...state.players];
    newPlayers[nextIndex].saidUnoThisTurn = false; 

    return {
      ...state,
      players: newPlayers,
      currentPlayerIndex: nextIndex
    };
  };

  // Main function to play a card
  const playCard = (playerIndex: number, card: Card, declaredColor?: CardColor) => {
    setGameState(prev => {
      // 1. Remove card from hand
      const newPlayers = [...prev.players];
      const player = newPlayers[playerIndex];
      player.hand = player.hand.filter(c => c.id !== card.id);
      
      // Check winner
      if (player.hand.length === 0) {
        addLog(`${player.name} 获胜！`, "裁判");
        return {
          ...prev,
          players: newPlayers,
          discardPile: [card, ...prev.discardPile],
          winner: player,
          gameStatus: 'gameover'
        };
      }

      // 2. Determine next state variables
      let newDirection = prev.direction;
      let skipNext = false;
      let newDrawStack = prev.drawStack;
      let nextStatus = prev.gameStatus;
      let newCurrentColor = card.color === CardColor.Black ? (declaredColor || CardColor.Red) : card.color;
      let pendingSender = null;
      let prevColorForChallenge = prev.currentColor;

      // Handle Special Cards
      if (card.value === CardValue.Reverse) {
        newDirection = (prev.direction * -1) as 1 | -1;
        addLog(`${player.name} 打出了 反转！`);
      } else if (card.value === CardValue.Skip) {
        skipNext = true;
        addLog(`${player.name} 打出了 跳过！`);
      } else if (card.value === CardValue.DrawTwo) {
        newDrawStack += 2;
        addLog(`${player.name} 打出了 +2！(当前累计: ${newDrawStack})`);
      } else if (card.value === CardValue.WildDrawFour) {
        newDrawStack += 4;
        // Store the color BEFORE this card changed it, for challenge verification
        prevColorForChallenge = prev.currentColor;
        
        // For display purposes on the card itself in the discard pile
        card.tempColor = declaredColor; 
        
        // IMPORTANT: When +4 is played, we enter a Challenge Opportunity phase
        // The turn DOES NOT advance yet. The next player must decide: Challenge, Stack, or Accept.
        nextStatus = 'challenge_chance';
        pendingSender = playerIndex;
        
        addLog(`${player.name} 打出了 +4！(当前累计: ${newDrawStack})`);
        
        // Bot reaction
        if (player.isHuman) {
             generateBotReaction(prev.players[1], "Player played Wild Draw 4", card).then(res => res && addLog(res, prev.players[1].name));
        }
      } else if (card.value === CardValue.Wild) {
        card.tempColor = declaredColor;
        addLog(`${player.name} 打出了 变色 (变为 ${declaredColor === CardColor.Red ? '红' : declaredColor === CardColor.Blue ? '蓝' : declaredColor === CardColor.Green ? '绿' : '黄'})！`);
      } else {
         addLog(`${player.name} 打出了 ${card.color} ${card.value}`);
      }

      // Check UNO status update (Must happen before turn end)
      // If they have 1 card left and didn't say UNO, they are vulnerable (handled by separate check usually, but here we simplify: did they say it this turn?)
      // Logic for UNO penalty is separate button.
      
      // Construct intermediate state
      let newState: GameState = {
        ...prev,
        players: newPlayers,
        discardPile: [card, ...prev.discardPile],
        direction: newDirection,
        drawStack: newDrawStack,
        currentColor: newCurrentColor,
        gameStatus: nextStatus,
        previousColor: prevColorForChallenge,
        pendingPlusFourSender: pendingSender
      };

      // If NOT a challenge situation, advance turn normally
      if (nextStatus !== 'challenge_chance') {
        newState = advanceTurn(newState, skipNext);
      }

      return newState;
    });
  };

  // --- AI LOGIC ---

  const playAiTurn = () => {
    setGameState(prev => {
        const aiIndex = prev.currentPlayerIndex;
        const aiPlayer = prev.players[aiIndex];
        const topCard = prev.discardPile[0];

        // 1. UNO Check (AI Logic)
        // If AI has 2 cards, it plays one -> 1 left. It should "Say UNO" probability 90%
        if (aiPlayer.hand.length === 2) {
            if (Math.random() > 0.1) {
                // AI remembers to say UNO
                const updatedPlayers = [...prev.players];
                updatedPlayers[aiIndex].hasCalledUno = true;
                updatedPlayers[aiIndex].saidUnoThisTurn = true;
                addLog(`${aiPlayer.name} 喊出了 "UNO"!`);
                // Update state locally for this render cycle to persist
                prev.players = updatedPlayers; 
            }
        }

        // 2. Catch Human Missed UNO
        // If Human (index 0) has 1 card and !hasCalledUno, AI has 50% chance to catch
        const human = prev.players[0];
        if (human.hand.length === 1 && !human.hasCalledUno) {
             if (Math.random() > 0.5) {
                 addLog(`${aiPlayer.name} 检举你忘记喊 UNO！罚摸2张。`);
                 setTimeout(() => drawCardAction(0, 2), 500);
             }
        }

        // 3. Stacking / Playing Logic
        const playableCards = aiPlayer.hand.filter(c => isCardPlayable(c, topCard, prev.currentColor, prev.drawStack));

        // --- SCENARIO: +4 Challenge Opportunity (AI is the Target) ---
        // This function `playAiTurn` is called when it IS the AI's turn.
        // If `gameStatus` is `challenge_chance`, it means the PREVIOUS player played +4.
        // The current index is NOT advanced yet in `playCard` for +4, so this block won't trigger via normal `useEffect`.
        // We need a separate handler for `challenge_chance` if the *next* player is AI. 
        // See `useEffect` below for challenge handling.
        
        // Normal Play (including stacking +2)
        if (playableCards.length > 0) {
            // AI Strategy: Prioritize stacking if stack > 0
            // Prioritize Action cards
            // Random otherwise
            
            let cardToPlay = playableCards.find(c => c.value === CardValue.WildDrawFour) || 
                             playableCards.find(c => c.value === CardValue.DrawTwo) ||
                             playableCards.find(c => c.value === CardValue.Skip || c.value === CardValue.Reverse) ||
                             playableCards[0];
            
            // Smart stacking: if stack > 0, MUST play stackable. `playableCards` already filters this.
            
            // Determine color for Wilds
            let declareColor = CardColor.Red;
            if (cardToPlay.color === CardColor.Black) {
                const counts = { [CardColor.Red]: 0, [CardColor.Blue]: 0, [CardColor.Green]: 0, [CardColor.Yellow]: 0 };
                aiPlayer.hand.forEach(c => { if(c.color !== CardColor.Black) counts[c.color]++; });
                declareColor = (Object.keys(counts) as CardColor[]).reduce((a, b) => counts[a] > counts[b] ? a : b);
            }

            // Call play (need to wrap in setTimeout to break render cycle if needed, but playCard sets state)
            // We need to execute playCard outside the setState callback
            // So we return unmodified prev and trigger playCard via timeout
            setTimeout(() => playCard(aiIndex, cardToPlay, declareColor), 100);
            return prev;

        } else {
            // No playable cards
            if (prev.drawStack > 0) {
                // Must draw stack
                addLog(`${aiPlayer.name} 无法出牌，被罚摸 ${prev.drawStack} 张。`);
                setTimeout(() => {
                    drawCardAction(aiIndex, prev.drawStack);
                    // After drawing stack, turn ends (usually skipped)
                    setGameState(s => advanceTurn(s, false)); // Normally skipped, effectively simple advance as they lose turn logic-wise by drawing
                }, 100);
                return prev;
            } else {
                // Normal draw
                addLog(`${aiPlayer.name} 摸了一张牌。`);
                setTimeout(() => {
                    drawCardAction(aiIndex, 1);
                    // Optional: Play drawn card if valid (Simplified: just pass)
                    setGameState(s => advanceTurn(s, false));
                }, 100);
                return prev;
            }
        }
    });
  };

  // --- CHALLENGE LOGIC HANDLING ---

  useEffect(() => {
      if (gameState.gameStatus === 'challenge_chance') {
          // A +4 was played. The turn hasn't advanced yet in index, 
          // BUT logic dictates the *next* player is the one who decides.
          // So we need to find who the next player IS.
          const nextPlayerIdx = getNextPlayerIndex(gameState.currentPlayerIndex, gameState.direction, 4);
          const nextPlayer = gameState.players[nextPlayerIdx];

          if (!nextPlayer.isHuman) {
              // AI Decision on Challenge
              setTimeout(() => {
                  handleAiChallengeDecision(nextPlayerIdx);
              }, 1500);
          }
          // If human, UI shows modal (handled in render)
      }
  }, [gameState.gameStatus]);

  const handleAiChallengeDecision = (aiIndex: number) => {
      // AI Strategy: 
      // If AI has a +4, it will stack (Play +4).
      // If not, it considers challenging.
      // If hand size is small, maybe challenge? Random 25% challenge.
      
      const aiPlayer = gameState.players[aiIndex];
      const hasPlusFour = aiPlayer.hand.some(c => c.value === CardValue.WildDrawFour);

      if (hasPlusFour) {
          // Stack it!
          const card = aiPlayer.hand.find(c => c.value === CardValue.WildDrawFour)!;
          // Pick mostly prominent color
          playCard(aiIndex, card, CardColor.Red); // Simplified color pick
          return;
      }

      // Decide to challenge or accept
      const shouldChallenge = Math.random() < 0.25; 
      
      if (shouldChallenge) {
          resolveChallenge(true, aiIndex);
      } else {
          resolveChallenge(false, aiIndex);
      }
  };

  const resolveChallenge = (isChallenging: boolean, challengerIndex: number) => {
      setGameState(prev => {
          const senderIndex = prev.pendingPlusFourSender!;
          const sender = prev.players[senderIndex];
          
          if (isChallenging) {
              addLog(`${prev.players[challengerIndex].name} 质疑了 +4！`);
              
              // Check Legality: Did sender have the Previous Color?
              // We need to reconstruct sender's hand concept. The +4 is already in discard.
              // We just check their CURRENT hand for `previousColor`.
              const isIllegal = sender.hand.some(c => c.color === prev.previousColor);
              
              if (isIllegal) {
                  // SUCCESSFUL CHALLENGE
                  addLog(`质疑成功！${sender.name} 手里有 ${prev.previousColor === CardColor.Red ? '红色' : prev.previousColor === CardColor.Blue ? '蓝色' : prev.previousColor === CardColor.Green ? '绿色' : '黄色'} 牌，违规出 +4！`);
                  addLog(`${sender.name} 被罚摸 4 张牌。`);
                  
                  // Sender draws 4.
                  // Next player (Challenger) does NOT draw.
                  // Stack is cleared.
                  // Turn moves to Challenger (they can play).
                  
                  setTimeout(() => drawCardAction(senderIndex, 4), 500);
                  
                  return {
                      ...prev,
                      drawStack: 0,
                      gameStatus: 'playing',
                      pendingPlusFourSender: null,
                      currentPlayerIndex: challengerIndex // Challenger gets to play
                  };
              } else {
                  // FAILED CHALLENGE
                  addLog(`质疑失败！${sender.name} 出牌合法。`);
                  addLog(`${prev.players[challengerIndex].name} 被罚摸 ${prev.drawStack + 2} 张牌 (6张)。`);
                  
                  // Challenger draws Stack + 2 (Usually 6).
                  // Challenger loses turn.
                  
                  const penalty = prev.drawStack + 2;
                  setTimeout(() => drawCardAction(challengerIndex, penalty), 500);
                  
                  // Skip challenger
                  const nextNext = getNextPlayerIndex(challengerIndex, prev.direction, 4);
                  
                  return {
                      ...prev,
                      drawStack: 0,
                      gameStatus: 'playing',
                      pendingPlusFourSender: null,
                      currentPlayerIndex: nextNext
                  };
              }
          } else {
              // DECLINED CHALLENGE (Accept)
              addLog(`${prev.players[challengerIndex].name} 接受了惩罚。`);
              addLog(`${prev.players[challengerIndex].name} 摸了 ${prev.drawStack} 张牌。`);
              
              setTimeout(() => drawCardAction(challengerIndex, prev.drawStack), 500);
              
              // Skip turn
              const nextNext = getNextPlayerIndex(challengerIndex, prev.direction, 4);

              return {
                  ...prev,
                  drawStack: 0,
                  gameStatus: 'playing',
                  pendingPlusFourSender: null,
                  currentPlayerIndex: nextNext
              };
          }
      });
  };

  // --- HUMAN INPUT HANDLERS ---

  const handleHumanCardClick = (card: Card) => {
    const humanIdx = 0;
    if (gameState.currentPlayerIndex !== humanIdx) return;
    if (gameState.gameStatus !== 'playing') return;

    // Check valid
    const topCard = gameState.discardPile[0];
    if (!isCardPlayable(card, topCard, gameState.currentColor, gameState.drawStack)) {
        // Shake animation or toast could go here
        return;
    }

    // Check if Wild
    if (card.color === CardColor.Black) {
        setPendingCard(card);
        setGameState(prev => ({ ...prev, gameStatus: 'color_selection' }));
    } else {
        playCard(humanIdx, card);
    }
  };

  const handleColorSelect = (color: CardColor) => {
    if (pendingCard) {
        playCard(0, pendingCard, color);
        setPendingCard(null);
        // playCard sets status back to playing or challenge_chance
    }
  };

  const handleUnoClick = () => {
      const humanIdx = 0;
      const player = gameState.players[humanIdx];
      
      // Allowed to say UNO if hand <= 2 (so after playing they have 1, or currently 2)
      if (player.hand.length > 2) {
          // False UNO call penalty?
          // Simplified: just ignore or warn
          addLog("你手里牌还多着呢，别乱喊！");
          return;
      }
      
      if (!gameState.unoCallCooldown) {
          setGameState(prev => {
              const newPlayers = [...prev.players];
              newPlayers[0].hasCalledUno = true;
              newPlayers[0].saidUnoThisTurn = true;
              return { ...prev, players: newPlayers, unoCallCooldown: true };
          });
          addLog("你喊了 UNO！");
          
          // Cooldown reset
          setTimeout(() => setGameState(p => ({ ...p, unoCallCooldown: false })), 3000);
      }
  };

  const handleReportMissedUno = () => {
      // Check bots
      let caught = false;
      gameState.players.forEach((p, idx) => {
          if (idx === 0) return; // Don't report self via this button
          if (p.hand.length === 1 && !p.hasCalledUno) {
              caught = true;
              addLog(`检举成功！${p.name} 忘记喊 UNO，罚摸2张！`);
              drawCardAction(idx, 2);
          }
      });
      
      if (!caught) {
          // False accusation penalty
          addLog("检举失败！没有人忘记喊 UNO。你被罚摸2张！");
          drawCardAction(0, 2);
      }
  };

  // --- RENDER ---

  const humanPlayer = gameState.players[0];
  const topCard = gameState.discardPile[0];
  
  // Determine if it's human's "Challenge Decision" turn
  const isHumanChallengeTurn = gameState.gameStatus === 'challenge_chance' && 
                               getNextPlayerIndex(gameState.currentPlayerIndex, gameState.direction, 4) === 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-900 text-white font-sans overflow-hidden select-none">
      
      {/* TOP BAR */}
      <div className="absolute top-0 w-full p-4 flex justify-between items-start pointer-events-none z-20">
         <div className="bg-black/50 p-2 rounded-lg backdrop-blur-sm">
             <h1 className="text-xl font-bold text-yellow-400">UNO 派对</h1>
             <div className="text-xs text-gray-300">
                当前颜色: 
                <span className={`ml-1 inline-block w-4 h-4 rounded-full ${
                    gameState.currentColor === CardColor.Red ? 'bg-red-500' :
                    gameState.currentColor === CardColor.Blue ? 'bg-blue-500' :
                    gameState.currentColor === CardColor.Green ? 'bg-green-500' : 'bg-yellow-400'
                }`}></span>
             </div>
             <div className="text-xs text-gray-300 mt-1">
                方向: {gameState.direction === 1 ? '顺时针 ↻' : '逆时针 ↺'}
             </div>
             {gameState.drawStack > 0 && (
                 <div className="mt-2 text-red-400 font-bold animate-pulse">
                     累计惩罚: +{gameState.drawStack}
                 </div>
             )}
         </div>
      </div>

      {/* GAME AREA */}
      <div className="relative w-full h-screen flex flex-col items-center justify-center">
        
        {/* OPPONENTS */}
        {/* Player 2 (Top) */}
        <div className="absolute top-4 flex flex-col items-center transition-opacity duration-500" style={{ opacity: animationState === 'dealing' ? 0 : 1 }}>
            <div className={`relative mb-2 ${gameState.currentPlayerIndex === 2 ? 'ring-4 ring-yellow-400 rounded-full' : ''}`}>
               <img src={gameState.players[2]?.avatar} alt="P2" className="w-16 h-16 rounded-full border-2 border-white bg-gray-700" />
               <div className="absolute -bottom-2 -right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
                  {gameState.players[2]?.hand.length} 张
               </div>
            </div>
            <span className="text-sm font-bold">{gameState.players[2]?.name}</span>
            <div className="flex -space-x-8 mt-2 transform scale-50">
               {gameState.players[2]?.hand.map((c, i) => <UnoCard key={c.id} card={c} hidden />)}
            </div>
        </div>

        {/* Player 1 (Left) */}
        <div className="absolute left-4 flex flex-col items-center transition-opacity duration-500" style={{ opacity: animationState === 'dealing' ? 0 : 1 }}>
            <div className={`relative mb-2 ${gameState.currentPlayerIndex === 1 ? 'ring-4 ring-yellow-400 rounded-full' : ''}`}>
               <img src={gameState.players[1]?.avatar} alt="P1" className="w-16 h-16 rounded-full border-2 border-white bg-gray-700" />
               <div className="absolute -bottom-2 -right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
                  {gameState.players[1]?.hand.length} 张
               </div>
            </div>
            <span className="text-sm font-bold">{gameState.players[1]?.name}</span>
            <div className="flex flex-col -space-y-12 mt-2 transform scale-50 origin-top-left">
                {gameState.players[1]?.hand.map((c, i) => <UnoCard key={c.id} card={c} hidden className="rotate-90" />)}
            </div>
        </div>

        {/* Player 3 (Right) */}
        <div className="absolute right-4 flex flex-col items-center transition-opacity duration-500" style={{ opacity: animationState === 'dealing' ? 0 : 1 }}>
            <div className={`relative mb-2 ${gameState.currentPlayerIndex === 3 ? 'ring-4 ring-yellow-400 rounded-full' : ''}`}>
               <img src={gameState.players[3]?.avatar} alt="P3" className="w-16 h-16 rounded-full border-2 border-white bg-gray-700" />
               <div className="absolute -bottom-2 -right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
                  {gameState.players[3]?.hand.length} 张
               </div>
            </div>
            <span className="text-sm font-bold">{gameState.players[3]?.name}</span>
            <div className="flex flex-col -space-y-12 mt-2 transform scale-50 origin-top-right">
                {gameState.players[3]?.hand.map((c, i) => <UnoCard key={c.id} card={c} hidden className="-rotate-90" />)}
            </div>
        </div>

        {/* CENTER TABLE */}
        <div className="flex items-center gap-8 mb-12">
           {/* Deck */}
           <div 
             className="relative cursor-pointer hover:scale-105 transition-transform"
             onClick={() => {
                 if (gameState.currentPlayerIndex === 0 && gameState.gameStatus === 'playing' && gameState.drawStack === 0) {
                     drawCardAction(0, 1);
                     setGameState(s => advanceTurn(s, false));
                 } else if (gameState.currentPlayerIndex === 0 && gameState.drawStack > 0) {
                     // Forced draw from stack (if choosing not to stack)
                     addLog(`你接受了惩罚，摸 ${gameState.drawStack} 张牌。`);
                     drawCardAction(0, gameState.drawStack);
                     setGameState(s => advanceTurn(s, false));
                 }
             }}
           >
               <div className="w-24 h-36 bg-gray-800 rounded-lg border-2 border-white flex items-center justify-center shadow-xl">
                  <div className="w-16 h-24 bg-red-600 rounded border-2 border-yellow-400 transform rotate-12"></div>
               </div>
               <span className="absolute -bottom-6 left-0 w-full text-center text-sm font-bold">摸牌</span>
           </div>

           {/* Discard Pile */}
           <div className="relative">
               {gameState.discardPile.slice(0, 5).reverse().map((c, i) => (
                   <div key={c.id} className="absolute top-0 left-0" style={{ transform: `rotate(${i * 5}deg) translate(${i*2}px, ${i*2}px)`, zIndex: i }}>
                       <UnoCard card={c} disabled />
                   </div>
               ))}
               {/* Actual Top Card */}
               <div className="relative z-10 transform rotate-6">
                  {topCard && <UnoCard card={topCard} size="md" disabled />}
               </div>
           </div>
        </div>

        {/* PLAYER HAND (Bottom) */}
        <div className="absolute bottom-4 w-full flex flex-col items-center z-30">
            
            {/* Controls */}
            <div className="flex gap-4 mb-4 pointer-events-auto">
                <button 
                    onClick={handleUnoClick}
                    className={`px-6 py-2 rounded-full font-bold shadow-lg transition-all ${
                        humanPlayer?.hasCalledUno ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95'
                    }`}
                >
                    喊 UNO!
                </button>
                <button 
                    onClick={handleReportMissedUno}
                    className="px-6 py-2 bg-red-600 text-white rounded-full font-bold shadow-lg hover:bg-red-500 active:scale-95 flex items-center gap-2"
                >
                    <AlertTriangle size={18} /> 检举漏喊
                </button>
            </div>

            {/* Hand Cards */}
            <div className="flex items-end justify-center -space-x-10 h-48 pb-4 px-4 overflow-x-visible">
                {humanPlayer?.hand.map((card, index) => {
                    const isPlayable = isCardPlayable(card, topCard, gameState.currentColor, gameState.drawStack) && gameState.currentPlayerIndex === 0;
                    return (
                        <div 
                            key={card.id} 
                            className="transform transition-transform hover:-translate-y-8"
                            style={{ 
                                zIndex: index,
                                transformOrigin: 'bottom center',
                                transform: `rotate(${(index - humanPlayer.hand.length/2) * 5}deg)`
                            }}
                        >
                            <UnoCard 
                                card={card} 
                                size="md" 
                                playable={isPlayable}
                                onClick={() => handleHumanCardClick(card)}
                                className={!isPlayable && gameState.currentPlayerIndex === 0 ? 'opacity-50' : ''}
                            />
                        </div>
                    );
                })}
            </div>
            
            {/* Player Info */}
            <div className={`mt-2 flex items-center gap-3 px-4 py-2 rounded-full ${gameState.currentPlayerIndex === 0 ? 'bg-yellow-400/20 border border-yellow-400' : 'bg-black/40'}`}>
                <img src={humanPlayer?.avatar} alt="You" className="w-10 h-10 rounded-full border border-white" />
                <div className="text-left">
                    <div className="font-bold text-sm">你 (You)</div>
                    <div className="text-xs text-gray-300">{humanPlayer?.hand.length} 张牌</div>
                </div>
            </div>
        </div>

        {/* CHAT LOG */}
        <div 
            ref={chatContainerRef}
            className="absolute bottom-32 left-4 w-64 h-48 bg-black/60 backdrop-blur-md rounded-lg overflow-y-auto p-2 text-sm border border-white/10 pointer-events-auto"
        >
            {chatMessages.map((msg, i) => (
                <div key={i} className="mb-1">
                    <span className={`font-bold ${msg.sender === '系统' || msg.sender === '裁判' ? 'text-yellow-400' : 'text-blue-400'}`}>
                        {msg.sender}:
                    </span> 
                    <span className="text-white/90 ml-1">{msg.text}</span>
                </div>
            ))}
        </div>
      </div>

      {/* MODALS & OVERLAYS */}
      
      {/* 1. LOBBY / START */}
      {gameState.gameStatus === 'lobby' && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
              <div className="text-center">
                  <h1 className="text-6xl font-bold text-yellow-400 mb-4 tracking-tighter">UNO PARTY</h1>
                  <p className="text-xl text-gray-300 mb-8">准备好和 AI 对战了吗？</p>
                  <button 
                    onClick={startGame}
                    className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white text-xl font-bold rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-2 mx-auto"
                  >
                      <Play size={24} /> 开始游戏
                  </button>
              </div>
          </div>
      )}

      {/* 2. DEALING ANIMATION */}
      {animationState === 'dealing' && (
           <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40 pointer-events-none">
               <div className="text-4xl font-bold text-white animate-pulse">
                   发牌中...
               </div>
           </div>
      )}

      {/* 3. COLOR PICKER */}
      {gameState.gameStatus === 'color_selection' && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-gray-800 p-6 rounded-xl border border-white/20 shadow-2xl text-center">
                  <h2 className="text-2xl font-bold mb-6">选择颜色</h2>
                  <div className="grid grid-cols-2 gap-4">
                      {[CardColor.Red, CardColor.Blue, CardColor.Green, CardColor.Yellow].map(c => (
                          <button
                            key={c}
                            onClick={() => handleColorSelect(c)}
                            className={`w-24 h-24 rounded-lg ${
                                c === CardColor.Red ? 'bg-red-500' :
                                c === CardColor.Blue ? 'bg-blue-500' :
                                c === CardColor.Green ? 'bg-green-500' : 'bg-yellow-400'
                            } hover:scale-105 transition-transform shadow-lg`}
                          />
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* 4. CHALLENGE DECISION (For Human) */}
      {isHumanChallengeTurn && (
           <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
               <div className="bg-gray-900 p-8 rounded-2xl border-2 border-red-500 shadow-2xl max-w-md text-center">
                   <ShieldAlert size={64} className="text-red-500 mx-auto mb-4" />
                   <h2 className="text-3xl font-bold text-white mb-2">上家出了 +4！</h2>
                   <p className="text-gray-300 mb-6">
                       你可以质疑他是否手中有颜色匹配的牌 (违规)。<br/>
                       如果质疑成功，他摸4张。<br/>
                       如果质疑失败，你摸6张 (4+2) 并且跳过回合。
                   </p>
                   
                   {/* Check if Human can stack */}
                   {humanPlayer.hand.some(c => c.value === CardValue.WildDrawFour) && (
                       <div className="mb-4 text-yellow-400 font-bold text-sm bg-yellow-900/30 p-2 rounded">
                           提示: 你手中有 +4，可以直接打出进行叠加！(点击 "不质疑" 然后出牌)
                       </div>
                   )}

                   <div className="flex gap-4 justify-center">
                       <button 
                           onClick={() => resolveChallenge(true, 0)}
                           className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg"
                       >
                           质疑 (Challenge)
                       </button>
                       <button 
                           onClick={() => resolveChallenge(false, 0)}
                           className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg"
                       >
                           不质疑 (接受/叠加)
                       </button>
                   </div>
               </div>
           </div>
      )}

      {/* 5. GAME OVER */}
      {gameState.gameStatus === 'gameover' && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
              <div className="text-center p-10 bg-gray-800 rounded-2xl border border-yellow-400">
                  <h1 className="text-5xl font-bold text-yellow-400 mb-4">游戏结束！</h1>
                  <p className="text-2xl text-white mb-8">
                      获胜者: <span className="font-bold text-green-400">{gameState.winner?.name}</span>
                  </p>
                  <button 
                    onClick={startGame}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold rounded-full flex items-center gap-2 mx-auto"
                  >
                      <RotateCcw /> 再来一局
                  </button>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;
