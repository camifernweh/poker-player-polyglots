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
    private regretValues: { [action: string]: number } = {
        fold: 0,
        call: 0,
        raise: 0,
    };
    private strategy: { [action: string]: number } = {
        fold: 0,
        call: 0,
        raise: 0,
    };
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

        const isPreFlop = community_cards.length === 0;
        const handStrength = this.evaluateHand(
            player.hole_cards,
            community_cards
        );

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
                betCallback,
                community_cards
            );
        }

        this.trackOpponentBehavior(players);
        this.updateStrategy();
    }

    // Aggressive Pre-Flop Strategy
    private aggressivePreFlopStrategy(
        handStrength: number,
        callAmount: number,
        minimum_raise: number,
        betCallback: (bet: number) => void
    ): void {
        if (handStrength > 80) {
            this.makeBet(callAmount + minimum_raise * 4, betCallback, 'raise');
        } else if (handStrength > 50) {
            this.makeBet(callAmount + minimum_raise * 2, betCallback, 'raise');
        } else {
            this.makeBet(0, betCallback, 'fold'); // Fold weak hands
        }
    }

    // Post-Flop Strategy
    private postFlopStrategy(
        handStrength: number,
        callAmount: number,
        minimum_raise: number,
        betCallback: (bet: number) => void,
        community_cards: Card[]
    ): void {
        const bluffFrequency = this.getBluffFrequency();
        const isContinuation = this.isContinuationBettingScenario();

        if (isContinuation) {
            this.makeBet(
                callAmount + minimum_raise * this.randomBetMultiplier(),
                betCallback,
                'raise'
            );
            return;
        }

        // High-risk bluffing or value betting
        if (bluffFrequency > Math.random()) {
            this.makeBet(
                callAmount + minimum_raise * this.randomBetMultiplier(),
                betCallback,
                'raise'
            ); // Strong bluff
        } else if (handStrength > 50) {
            this.makeBet(
                callAmount + minimum_raise * this.randomBetMultiplier(),
                betCallback,
                'call'
            ); // Value bet
        } else {
            this.makeBet(0, betCallback, 'fold'); // Fold weak hands
        }
    }

    private makeBet(
        amount: number,
        betCallback: (bet: number) => void,
        action: string
    ): void {
        betCallback(amount);
        this.updateRegret(action, amount);
    }

    // Update regrets based on the action taken and amount bet
    private updateRegret(action: string, amount: number): void {
        if (action === 'raise') {
            this.regretValues.raise += Math.max(0, amount);
        } else if (action === 'call') {
            this.regretValues.call += Math.max(0, amount);
        } else {
            this.regretValues.fold += 1; // Count the fold as a negative regret
        }
    }

    // Update strategy based on regret values
    private updateStrategy(): void {
        const totalRegret = Object.values(this.regretValues).reduce(
            (a, b) => a + b,
            0
        );

        if (totalRegret <= 0) {
            // If all regrets are non-positive, maintain the current strategy
            return;
        }

        for (const action of Object.keys(this.strategy)) {
            this.strategy[action] =
                Math.max(0, this.regretValues[action]) / totalRegret;
        }
    }

    // Get bluff frequency based on opponent tendencies
    private getBluffFrequency(): number {
        const aggressionLevel = Object.values(this.opponentAggression).reduce(
            (a, b) => a + b,
            0
        );
        const numOpponents = Object.keys(this.opponentAggression).length;

        if (numOpponents === 0) return 0.2; // Default bluff frequency

        const averageAggression = aggressionLevel / numOpponents;
        return Math.max(0.1, Math.min(0.7, 0.5 - averageAggression * 0.1));
    }

    // Randomize bet sizing for mixed strategies
    private randomBetMultiplier(): number {
        return Math.random() < 0.5 ? 2 : 1; // 50% chance to use a larger bet
    }

    // Continuation bet scenario check
    private isContinuationBettingScenario(): boolean {
        return true; // Always assume we can continue betting
    }

    // Track opponent behavior based on betting patterns
    private trackOpponentBehavior(players: PlayerData[]): void {
        players.forEach((opponent) => {
            if (!this.opponentAggression[opponent.id]) {
                this.opponentAggression[opponent.id] = 0;
            }

            if (opponent.bet > 0) {
                this.opponentAggression[opponent.id] += 1; // Aggressive behavior
            } else {
                this.opponentAggression[opponent.id] -= 1; // Passive behavior
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
                const handStrength = this.evaluateHand(
                    player.hole_cards,
                    community_cards
                );
                console.log(
                    `Player ${player.name} has hand strength: ${handStrength}`
                );
            }
        });
    }

    // Example hand evaluator (simplified for demonstration)
    private evaluateHand(
        holeCards: Card[] = [],
        communityCards: Card[]
    ): number {
        const allCards = [...holeCards, ...communityCards];
        const rankCount = this.countRanks(allCards);
        const suitCount = this.countSuits(allCards);
        const isFlush = Object.values(suitCount).some((count) => count >= 5);
        const isStraight = this.checkStraight(rankCount);

        const pairs = this.getPairs(rankCount);
        const threeOfAKind = this.getThreeOfAKind(rankCount);
        const fourOfAKind = this.getFourOfAKind(rankCount);

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
        if (pairs.length > 0) {
            return 30; // One Pair
        }
        return 10; // High Card
    }

    private countRanks(cards: Card[]): Map<string, number> {
        const rankCount = new Map<string, number>();
        cards.forEach((card) => {
            rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
        });
        return rankCount;
    }

    private countSuits(cards: Card[]): Map<string, number> {
        const suitCount = new Map<string, number>();
        cards.forEach((card) => {
            suitCount.set(card.suit, (suitCount.get(card.suit) || 0) + 1);
        });
        return suitCount;
    }

    private checkStraight(rankCount: Map<string, number>): boolean {
        const ranks = Array.from(rankCount.keys())
            .map((rank) => this.rankValue(rank))
            .sort((a, b) => a - b);
        for (let i = 0; i < ranks.length - 4; i++) {
            if (ranks[i] + 4 === ranks[i + 4]) {
                return true; // Found a straight
            }
        }
        return false;
    }

    private rankValue(rank: string): number {
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
        return rankValues[rank] || 0;
    }

    private getPairs(rankCount: Map<string, number>): string[] {
        return Array.from(rankCount.entries())
            .filter(([_, count]) => count === 2)
            .map(([rank]) => rank);
    }

    private getThreeOfAKind(rankCount: Map<string, number>): boolean {
        return Array.from(rankCount.values()).some((count) => count === 3);
    }

    private getFourOfAKind(rankCount: Map<string, number>): boolean {
        return Array.from(rankCount.values()).some((count) => count === 4);
    }
}
