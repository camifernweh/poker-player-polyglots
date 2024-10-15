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
function evaluateHand(holeCards: Card[], communityCards: Card[]): number {
  const allCards = [...holeCards, ...communityCards];
  // Example: evaluate the hand strength and return a score between 0 and 100
  let score = 0;

  const rankCount: { [rank: string]: number } = {};
  allCards.forEach(card => {
    rankCount[card.rank] = (rankCount[card.rank] || 0) + 1;
  });

  Object.values(rankCount).forEach(count => {
    if (count === 2) score += 10; // Pair
    else if (count === 3) score += 30; // Three of a kind
    else if (count === 4) score += 50; // Four of a kind
  });

  return score;
}

export default PlayerData;
