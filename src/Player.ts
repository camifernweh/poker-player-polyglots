type GameState = {
  current_buy_in: number; // The highest bet so far in the current round
  minimum_raise: number; // The minimum raise required
  players: PlayerData[]; // List of players in the game
  in_action: number; // Index of the player whose turn it is
  community_cards: Card[]; // Cards shared by all players
  pot: number; // The total size of the pot
};

type PlayerData = {
  id: number;
  name: string;
  stack: number; // The number of chips this player has
  bet: number; // The number of chips this player has bet in the current round
  hole_cards: Card[]; // The player's personal hand
};

type Card = {
  rank: string; // Card rank: "2", "3", ..., "J", "Q", "K", "A"
  suit: string; // Card suit: "hearts", "spades", "diamonds", "clubs"
};
export class Player {
  public betRequest(gameState: any, betCallback: (bet: number) => void): void {
    const { current_buy_in, minimum_raise, players, in_action } = gameState;
    const player = players[in_action];
    const playerBet = player.bet;

    // Calculate the call amount (difference between current buy-in and player's bet)
    const callAmount = current_buy_in - playerBet;

    // Basic decision-making logic (expand based on hand strength, pot odds, etc.)
    const handStrength = evaluateHand(player.hole_cards, gameState.community_cards);

    if (handStrength > 50) {
      // Raise if hand strength is strong
      betCallback(current_buy_in + minimum_raise);
    } else if (handStrength > 20) {
      // Call if hand strength is moderate
      betCallback(callAmount);
    } else {
      // Fold if hand is weak (bet 0)
      betCallback(0);
    }

  }

  public showdown(gameState: any): void {

  }
};

// Example hand evaluator (simplified for demonstration)
/**
 * Evaluates the strength of a poker hand.
 * @param holeCards - The player's hole cards.
 * @param communityCards - The community cards on the table.
 * @returns A numerical score representing the hand's strength.
 */
function evaluateHand(holeCards: Card[], communityCards: Card[]): number {
  const allCards = [...holeCards, ...communityCards];
  const ranks = allCards.map(card => card.rank);
  const suits = allCards.map(card => card.suit);

  // Helper functions
  const rankValues: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12,
    'K': 13, 'A': 14
  };

  const sortedRanks = ranks
    .map(rank => rankValues[rank])
    .sort((a, b) => a - b);

  const isFlush = (suits: string[]): boolean => {
    const suitCount: { [suit: string]: number } = {};
    suits.forEach(suit => {
      suitCount[suit] = (suitCount[suit] || 0) + 1;
    });
    return Object.values(suitCount).some(count => count >= 5);
  };

  const isStraight = (sortedRanks: number[]): number => {
    // Remove duplicates
    const uniqueRanks = Array.from(new Set(sortedRanks));
    for (let i = uniqueRanks.length - 1; i >= 4; i--) {
      if (
        uniqueRanks[i] === uniqueRanks[i - 1] + 1 &&
        uniqueRanks[i - 1] === uniqueRanks[i - 2] + 1 &&
        uniqueRanks[i - 2] === uniqueRanks[i - 3] + 1 &&
        uniqueRanks[i - 3] === uniqueRanks[i - 4] + 1
      ) {
        return uniqueRanks[i];
      }
    }
    // Special case: Ace-low straight (A-2-3-4-5)
    if (
      uniqueRanks.includes(14) &&
      uniqueRanks.includes(2) &&
      uniqueRanks.includes(3) &&
      uniqueRanks.includes(4) &&
      uniqueRanks.includes(5)
    ) {
      return 5;
    }
    return 0;
  };

  const countRanks = (ranks: string[]): { [rank: string]: number } => {
    const rankCount: { [rank: string]: number } = {};
    ranks.forEach(rank => {
      rankCount[rank] = (rankCount[rank] || 0) + 1;
    });
    return rankCount;
  };

  const flush = isFlush(suits);
  const straightHighCard = isStraight(sortedRanks);
  const rankCount = countRanks(ranks);
  const counts = Object.values(rankCount).sort((a, b) => b - a); // Descending

  // Determine hand type
  let score = 0;

  if (flush && straightHighCard >= 10) {
    // Example: Straight Flush
    score = 800 + straightHighCard;
  } else if (counts[0] === 4) {
    // Four of a Kind
    score = 700 + rankValues[getKeyByValue(rankCount, 4)!];
  } else if (counts[0] === 3 && counts[1] >= 2) {
    // Full House
    const threeKind = getKeyByValue(rankCount, 3)!;
    const pair = getKeyByValue(rankCount, 2)!;
    score = 600 + rankValues[threeKind] * 10 + rankValues[pair];
  } else if (flush) {
    // Flush
    score = 500 + Math.max(...sortedRanks);
  } else if (straightHighCard > 0) {
    // Straight
    score = 400 + straightHighCard;
  } else if (counts[0] === 3) {
    // Three of a Kind
    const threeKind = getKeyByValue(rankCount, 3)!;
    score = 300 + rankValues[threeKind];
  } else if (counts[0] === 2 && counts[1] === 2) {
    // Two Pair
    const pairs = Object.keys(rankCount).filter(rank => rankCount[rank] === 2);
    const highPair = Math.max(...pairs.map(rank => rankValues[rank]));
    const lowPair = Math.min(...pairs.map(rank => rankValues[rank]));
    score = 200 + highPair * 10 + lowPair;
  } else if (counts[0] === 2) {
    // One Pair
    const pair = getKeyByValue(rankCount, 2)!;
    score = 100 + rankValues[pair];
  } else {
    // High Card
    score = Math.max(...sortedRanks);
  }

  return score;
}

/**
 * Helper function to get the key by its value in an object.
 * @param obj - The object to search.
 * @param value - The value to find.
 * @returns The key corresponding to the value, or undefined.
 */
function getKeyByValue(obj: { [key: string]: number }, value: number): string | undefined {
  return Object.keys(obj).find(key => obj[key] === value);
}

export default PlayerData;
