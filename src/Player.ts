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
    private opponentAggression: { [id: number]: number } = {};

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

        // Pre-flop strategy
        if (isPreFlop) {
            this.aggressivePreFlopStrategy(
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
                community_cards,
                betCallback
            );
        }

        // Track opponent behavior
        this.trackOpponentBehavior(players);
    }

    // Aggressive Pre-Flop Strategy
    private aggressivePreFlopStrategy(
        handStrength: number,
        callAmount: number,
        minimum_raise: number,
        betCallback: (bet: number) => void
    ): void {
        if (handStrength > 70) {
            betCallback(callAmount + minimum_raise * 3); // Aggressive raise
        } else if (handStrength > 40) {
            betCallback(callAmount + minimum_raise); // Moderate raise
        } else {
            betCallback(0); // Fold weak hands
        }
    }

    // Post-Flop Strategy
    private postFlopStrategy(
        handStrength: number,
        callAmount: number,
        minimum_raise: number,
        community_cards: Card[],
        betCallback: (bet: number) => void
    ): void {
        // Example high-risk bluffing strategy based on community cards
        const isBoardWet = this.isBoardWet(community_cards); // Determine if the board is coordinated

        if (handStrength > 80 || (isBoardWet && handStrength > 50)) {
            betCallback(callAmount + minimum_raise * 2); // Aggressive raise or bluff
        } else if (handStrength > 50) {
            betCallback(callAmount + minimum_raise); // Consider calling
        } else {
            betCallback(0); // Fold weak hands
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

    // Check if the board is wet (coordinated)
    private isBoardWet(communityCards: Card[]): boolean {
        const ranks = communityCards.map((card) => card.rank);
        const uniqueRanks = new Set(ranks);
        return uniqueRanks.size <= 3; // Simplified wet board condition
    }

    public showdown(gameState: GameState): void {
        const { players, in_action, community_cards } = gameState;

        players.forEach((player: PlayerData) => {
            if (player.status === 'active') {
                console.log(
                    `Player ${player.name}'s hole cards:`,
                    player.hole_cards
                );
                const handStrength = evaluateHand(
                    player.hole_cards,
                    community_cards
                );
                console.log(
                    `Player ${player.name} has hand strength: ${handStrength}`
                );
            }
        });
    }
}

// Example hand evaluator (simplified for demonstration)
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
