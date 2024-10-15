type GameState = {
    tournament_id: string;
    game_id: string;
    round: number;
    bet_index: number;
    small_blind: number;
    current_buy_in: number;
    pot: number;
    minimum_raise: number;
    dealer: number;
    orbits: number;
    in_action: number;
    players: PlayerData[];
    community_cards: Card[];
};

type PlayerData = {
    id: number;
    name: string;
    status: 'active' | 'folded' | 'out';
    version: string;
    stack: number;
    bet: number;
    hole_cards?: Card[]; // Only present for the player "in_action" or after showdown
};

type Card = {
    rank: string; // Possible values are "2"-"10", "J", "Q", "K", "A"
    suit: 'clubs' | 'spades' | 'hearts' | 'diamonds';
};

export class Player {
    // Track opponent aggression levels
    private opponentAggression: { [id: number]: number } = {};

    // Bet request method
    public betRequest(
        gameState: GameState,
        betCallback: (bet: number) => void
    ): void {
        const {
            current_buy_in,
            minimum_raise,
            players,
            in_action,
            community_cards,
        } = gameState;
        const player = players[in_action];
        const playerBet = player.bet;
        const callAmount = current_buy_in - playerBet;

        // Pre-flop vs Post-flop handling
        const isPreFlop = community_cards.length === 0;
        const handStrength = evaluateHand(player.hole_cards, community_cards);

        // Adjust strategy based on pre-flop or post-flop
        if (isPreFlop) {
            this.preFlopStrategy(
                handStrength,
                callAmount,
                minimum_raise,
                betCallback
            );
        } else {
            this.postFlopStrategy(
                handStrength,
                callAmount,
                minimum_raise,
                betCallback
            );
        }

        // Track opponent behavior after making decisions
        this.trackOpponentBehavior(players);

        // Incorporate opponent-based strategy to adjust betting patterns
        this.opponentBasedStrategy(
            this.opponentAggression,
            handStrength,
            callAmount,
            minimum_raise,
            betCallback
        );
    }

    // Pre-flop strategy: Play tighter, raise more with strong hands
    private preFlopStrategy(
        handStrength: number,
        callAmount: number,
        minimum_raise: number,
        betCallback: (bet: number) => void
    ): void {
        if (handStrength > 70) {
            // Raise aggressively with strong hands
            betCallback(callAmount + minimum_raise * 2);
        } else if (handStrength > 40) {
            // Call with moderate hands
            betCallback(callAmount);
        } else {
            // Fold weak hands pre-flop
            betCallback(0);
        }
    }

    // Post-flop strategy: Adjust based on community cards and hand strength
    private postFlopStrategy(
        handStrength: number,
        callAmount: number,
        minimum_raise: number,
        betCallback: (bet: number) => void
    ): void {
        if (handStrength > 80) {
            // Strong hand post-flop, raise more
            betCallback(callAmount + minimum_raise * 2);
        } else if (handStrength > 50) {
            // Moderate hand, consider calling or small raise
            betCallback(callAmount + minimum_raise);
        } else if (handStrength > 20) {
            // Weak hand, but maybe call if pot odds are favorable
            betCallback(callAmount);
        } else {
            // Very weak hand, fold
            betCallback(0);
        }
    }

    // Track opponent behavior based on betting patterns
    private trackOpponentBehavior(players: PlayerData[]): void {
        players.forEach((opponent) => {
            if (!this.opponentAggression[opponent.id]) {
                this.opponentAggression[opponent.id] = 0;
            }

            // Basic heuristic: increase aggression score if betting a lot, decrease if folding
            if (opponent.bet > 0) {
                this.opponentAggression[opponent.id] += 1; // Aggressive behavior if betting
            } else {
                this.opponentAggression[opponent.id] -= 1; // Passive behavior if folding/checking
            }
        });
    }

    // Opponent-based strategy: Adjust betting decisions based on opponents' tendencies
    private opponentBasedStrategy(
        opponentAggression: { [id: number]: number },
        handStrength: number,
        callAmount: number,
        minimum_raise: number,
        betCallback: (bet: number) => void
    ): void {
        let aggressiveOpponents = 0;
        let passiveOpponents = 0;

        // Identify aggressive vs passive opponents
        Object.keys(opponentAggression).forEach((opponentId) => {
            if (opponentAggression[parseInt(opponentId)] > 3) {
                aggressiveOpponents++;
            } else if (opponentAggression[parseInt(opponentId)] < -3) {
                passiveOpponents++;
            }
        });

        // Adjust strategy based on opponent tendencies
        if (aggressiveOpponents > passiveOpponents) {
            // Against aggressive players, play tighter and raise less often unless holding a strong hand
            if (handStrength > 70) {
                betCallback(callAmount + minimum_raise * 2); // Strong hand, raise
            } else if (handStrength > 40) {
                betCallback(callAmount); // Moderate hand, just call
            } else {
                betCallback(0); // Weak hand, fold
            }
        } else if (passiveOpponents > aggressiveOpponents) {
            // Against passive players, exploit by raising more often with moderate hands
            if (handStrength > 50) {
                betCallback(callAmount + minimum_raise); // Moderate hand, raise more often
            } else {
                betCallback(callAmount); // Weak hand, still call if passive opponents
            }
        } else {
            // Default to the standard strategy if no clear aggressive/passive tendencies
            if (handStrength > 70) {
                betCallback(callAmount + minimum_raise * 2); // Strong hand, raise
            } else if (handStrength > 40) {
                betCallback(callAmount); // Moderate hand, call
            } else {
                betCallback(0); // Weak hand, fold
            }
        }
    }

    public showdown(gameState: GameState): void {
        const { players, in_action, community_cards } = gameState;

        // Retrieve the hole cards of all players (available at showdown)
        players.forEach((player: PlayerData) => {
            if (player.status === 'active') {
                console.log(
                    `Player ${player.name}'s hole cards:`,
                    player.hole_cards
                );
            }
        });

        // Evaluate hands for all players and print the results
        players.forEach((player: PlayerData) => {
            if (player.status === 'active') {
                const handStrength = evaluateHand(
                    player.hole_cards,
                    community_cards
                );
                console.log(
                    `Player ${player.name} has hand strength: ${handStrength}`
                );
            }
        });

        // We could add more complex strategies here for learning, but the method doesn't return anything
    }
}

// Example hand evaluator (simplified for demonstration)
/**
 * Evaluates the strength of a poker hand.
 * @param holeCards - The player's hole cards.
 * @param communityCards - The community cards on the table.
 * @returns A numerical score representing the hand's strength.
 */
function evaluateHand(holeCards: Card[] = [], communityCards: Card[]): number {
    const allCards = [...holeCards, ...communityCards];
    const ranks = allCards.map((card) => card.rank);
    const suits = allCards.map((card) => card.suit);

    // Helper functions
    const rankValues: { [key: string]: number } = {
        '2': 2,
        '3': 3,
        '4': 4,
        '5': 5,
        '6': 6,
        '7': 7,
        '8': 8,
        '9': 9,
        '10': 10,
        J: 11,
        Q: 12,
        K: 13,
        A: 14,
    };

    const sortedRanks = ranks
        .map((rank) => rankValues[rank])
        .sort((a, b) => a - b);

    const isFlush = (suits: string[]): boolean => {
        const suitCount: { [suit: string]: number } = {};
        suits.forEach((suit) => {
            suitCount[suit] = (suitCount[suit] || 0) + 1;
        });
        return Object.values(suitCount).some((count) => count >= 5);
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
        ranks.forEach((rank) => {
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
        const pairs = Object.keys(rankCount).filter(
            (rank) => rankCount[rank] === 2
        );
        const highPair = Math.max(...pairs.map((rank) => rankValues[rank]));
        const lowPair = Math.min(...pairs.map((rank) => rankValues[rank]));
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
function getKeyByValue(
    obj: { [key: string]: number },
    value: number
): string | undefined {
    return Object.keys(obj).find((key) => obj[key] === value);
}

export default PlayerData;
