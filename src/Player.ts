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

        // Determine player's position at the table
        const position = this.getPosition(in_action, players.length);

        // Adjust strategy based on pre-flop or post-flop
        if (isPreFlop) {
            this.preFlopStrategy(
                handStrength,
                callAmount,
                minimum_raise,
                betCallback,
                position
            );
        } else {
            this.postFlopStrategy(
                handStrength,
                callAmount,
                minimum_raise,
                betCallback,
                gameState,
                position
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
        betCallback: (bet: number) => void,
        position: number
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
        betCallback: (bet: number) => void,
        gameState: GameState,
        position: number
    ): void {
        const potOdds = this.calculatePotOdds(callAmount, gameState.pot);
        const bluffOpportunity = this.evaluateBluffOpportunity(
            handStrength,
            potOdds
        );

        if (handStrength > 80) {
            // Strong hand post-flop, raise more
            betCallback(callAmount + minimum_raise * 2);
        } else if (handStrength > 50) {
            // Moderate hand, consider calling or small raise
            betCallback(callAmount + minimum_raise);
        } else if (handStrength > 20 && bluffOpportunity) {
            // Bluffing opportunity based on pot odds and hand strength
            betCallback(callAmount + minimum_raise);
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

    // Calculate pot odds
    private calculatePotOdds(callAmount: number, pot: number): number {
        return pot > 0 ? callAmount / (pot + callAmount) : 0;
    }

    // Evaluate bluff opportunities
    private evaluateBluffOpportunity(
        handStrength: number,
        potOdds: number
    ): boolean {
        // Example logic for bluffing: bluff if hand strength is low and pot odds are favorable
        return handStrength < 40 && potOdds < 0.5; // Adjust thresholds based on desired aggressiveness
    }

    // Get player position at the table
    private getPosition(playerIndex: number, totalPlayers: number): number {
        return (playerIndex - totalPlayers) % totalPlayers;
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

/**
 * Evaluates the strength of a poker hand.
 * @param holeCards - The player's hole cards.
 * @param communityCards - The community cards on the table.
 * @returns A numerical score representing the hand's strength.
 */
function evaluateHand(holeCards: Card[] = [], communityCards: Card[]): number {
    const allCards = [...holeCards, ...communityCards];
    const rankCount = countRanks(allCards);
    const suitCount = countSuits(allCards);
    const isFlush = Object.values(suitCount).some((count) => count >= 5);
    const isStraight = checkStraight(rankCount);

    const pairs = getPairs(rankCount);
    const threeOfAKind = getThreeOfAKind(rankCount);
    const fourOfAKind = getFourOfAKind(rankCount);

    if (isStraight && isFlush && rankCount.has('A') && rankCount.has('K')) {
        return 100; // Royal Flush
    }
    if (isStraight && isFlush) {
        return 90; // Straight Flush
    }
    if (fourOfAKind) {
        return 80; // Four of a Kind
    }
    if (threeOfAKind && pairs.length > 0) {
        return 70; // Full House
    }
    if (isFlush) {
        return 60; // Flush
    }
    if (isStraight) {
        return 50; // Straight
    }
    if (threeOfAKind) {
        return 40; // Three of a Kind
    }
    if (pairs.length > 1) {
        return 30; // Two Pair
    }
    if (pairs.length === 1) {
        return 20; // One Pair
    }
    return 10; // High Card
}

// Helper function to count ranks
function countRanks(cards: Card[]): Map<string, number> {
    const rankCount = new Map<string, number>();
    cards.forEach((card) => {
        rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
    });
    return rankCount;
}

// Helper function to count suits
function countSuits(cards: Card[]): Map<string, number> {
    const suitCount = new Map<string, number>();
    cards.forEach((card) => {
        suitCount.set(card.suit, (suitCount.get(card.suit) || 0) + 1);
    });
    return suitCount;
}

// Check for straight hand
function checkStraight(rankCount: Map<string, number>): boolean {
    const ranks = Array.from(rankCount.keys())
        .map((rank) => getRankValue(rank))
        .sort((a, b) => a - b);
    for (let i = 0; i < ranks.length - 4; i++) {
        if (ranks[i + 4] - ranks[i] === 4) {
            return true;
        }
    }
    return false;
}

// Get the numerical value of card ranks
function getRankValue(rank: string): number {
    switch (rank) {
        case '2':
            return 2;
        case '3':
            return 3;
        case '4':
            return 4;
        case '5':
            return 5;
        case '6':
            return 6;
        case '7':
            return 7;
        case '8':
            return 8;
        case '9':
            return 9;
        case '10':
            return 10;
        case 'J':
            return 11;
        case 'Q':
            return 12;
        case 'K':
            return 13;
        case 'A':
            return 14; // Ace is high
        default:
            return 0;
    }
}

// Get pairs from rank counts
function getPairs(rankCount: Map<string, number>): string[] {
    const pairs: string[] = [];
    rankCount.forEach((count, rank) => {
        if (count === 2) {
            pairs.push(rank);
        }
    });
    return pairs;
}

// Check for three of a kind
function getThreeOfAKind(rankCount: Map<string, number>): boolean {
    return Array.from(rankCount.values()).some((count) => count === 3);
}

// Check for four of a kind
function getFourOfAKind(rankCount: Map<string, number>): boolean {
    return Array.from(rankCount.values()).some((count) => count === 4);
}
