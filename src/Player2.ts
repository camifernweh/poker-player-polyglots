import * as tf from '@tensorflow/tfjs';

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
    private totalRegret: number = 0;
    private iterations: number = 0;
    private model: tf.LayersModel;

    constructor() {
        this.model = this.createModel();
    }

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
        const handStrength = this.evaluateHand(player.hole_cards, community_cards);

        this.updateStrategy(); // Call the strategy update here

        const features = this.getFeatures(gameState, in_action);
        const action = this.neuralNetworkDecision(features);

        if (action === 'raise') {
            this.makeBet(callAmount + minimum_raise, betCallback, action);
        } else if (action === 'call') {
            this.makeBet(callAmount, betCallback, action);
        } else {
            this.makeBet(0, betCallback, 'fold');
        }

        this.iterations++; // Increment the number of iterations
    }

    private createModel(): tf.LayersModel {
        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [10] }));
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 3, activation: 'softmax' })); // 3 actions: fold, call, raise
        model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });
        return model;
    }

    private async trainModel(features: number[][], labels: number[][]): Promise<void> {
        const xs = tf.tensor2d(features);
        const ys = tf.tensor2d(labels);
        await this.model.fit(xs, ys, { epochs: 50 });
    }

    private async updateModel(gameState: GameState, action: string): Promise<void> {
        const features = this.getFeatures(gameState, gameState.in_action);
    
        // Validate if the action is valid before passing it to getActionLabel
        if (this.isValidAction(action)) {
            const label = this.getActionLabel(action);
            await this.trainModel([features], [label]);
        } else {
            console.error(`Invalid action provided: ${action}`);
            throw new Error(`Invalid action: ${action}`);
        }
    }
    
    // The isValidAction type guard ensures that the action is 'fold', 'call', or 'raise'
    private isValidAction(action: string): action is 'fold' | 'call' | 'raise' {
        return ['fold', 'call', 'raise'].includes(action);
    }
    
    private getActionLabel(action: 'fold' | 'call' | 'raise'): number[] {
        const labels: { [key in 'fold' | 'call' | 'raise']: number[] } = {
            fold: [1, 0, 0],
            call: [0, 1, 0],
            raise: [0, 0, 1],
        };
        return labels[action];
    }
    
    private neuralNetworkDecision(features: number[]): string {
        const inputTensor = tf.tensor2d([features]);
        const prediction = this.model.predict(inputTensor) as tf.Tensor;
        const actionIndex = prediction.argMax(-1).dataSync()[0];

        return ['fold', 'call', 'raise'][actionIndex];
    }

    private getFeatures(gameState: GameState, in_action: number): number[] {
        const player = gameState.players[in_action];
        const communityCards = gameState.community_cards;

        // Normalize features based on the game state
        return [
            player.stack / 1000, // Normalize stack size (example)
            player.bet / 1000, // Normalize current bet (example)
            gameState.pot / 1000, // Normalize pot size (example)
            communityCards.length, // Number of community cards
            ...this.cardFeatures(player.hole_cards ?? []),
            ...this.cardFeatures(communityCards),
        ];
    }

    private cardFeatures(cards: Card[]): number[] {
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const suitIndices = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 };

        const features = new Array(13).fill(0);
        cards.forEach(card => {
            const rankIndex = ranks.indexOf(card.rank);
            if (rankIndex !== -1) features[rankIndex] = 1;
        });

        return features.concat(new Array(4).fill(0)); // Additional space for suits if needed
    }

    private makeBet(amount: number, betCallback: (bet: number) => void, action: string): void {
        betCallback(amount);
        this.updateRegret(action, amount);
        this.updateModel(betCallback as unknown as GameState, action);
    }

    private updateRegret(action: string, amount: number): void {
        if (action === 'raise') {
            this.regretValues.raise += Math.max(0, amount);
        } else if (action === 'call') {
            this.regretValues.call += Math.max(0, amount);
        } else {
            this.regretValues.fold += 1; // Count the fold as a negative regret
        }
        this.totalRegret += amount; // Keep track of total regret
    }

    private updateStrategy(): void {
        const totalRegret = Object.values(this.regretValues).reduce((acc, val) => acc + val, 0);
        
        if (totalRegret > 0) {
            for (const action in this.regretValues) {
                this.strategy[action] = Math.max(0, this.regretValues[action]) / totalRegret;
            }
        } else {
            // If no positive regret, assign equal probabilities
            for (const action in this.strategy) {
                this.strategy[action] = 1 / Object.keys(this.strategy).length;
            }
        }
    }

    // Hand evaluation logic
    private evaluateHand(holeCards: Card[] = [], communityCards: Card[]): number {
        // Implement detailed hand evaluation logic
        // This can include evaluating for straight, flush, full house, etc.
        // For now, we'll keep it simple.
        const allCards = [...holeCards, ...communityCards];
        const rankCount = this.countRanks(allCards);
        const suitCount = this.countSuits(allCards);

        const pairs = this.getPairs(rankCount);
        const threeOfAKind = this.getThreeOfAKind(rankCount);
        const fourOfAKind = this.getFourOfAKind(rankCount);
        const isFlush = Object.values(suitCount).some(count => count >= 5);
        const isStraight = this.checkStraight(rankCount);

        if (isStraight && isFlush) {
            return 80; // Straight Flush
        }
        if (fourOfAKind) {
            return 70; // Four of a Kind
        }
        if (threeOfAKind && pairs.length > 0) {
            return 60; // Full House
        }
        if (isFlush) {
            return 50; // Flush
        }
        if (isStraight) {
            return 40; // Straight
        }
        if (threeOfAKind) {
            return 30; // Three of a Kind
        }
        if (pairs.length > 0) {
            return 20; // One Pair
        }
        return 10; // High Card
    }

    private countRanks(cards: Card[]): Map<string, number> {
        const rankCount = new Map<string, number>();
        cards.forEach(card => {
            rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
        });
        return rankCount;
    }

    private countSuits(cards: Card[]): Map<string, number> {
        const suitCount = new Map<string, number>();
        cards.forEach(card => {
            suitCount.set(card.suit, (suitCount.get(card.suit) || 0) + 1);
        });
        return suitCount;
    }

    private checkStraight(rankCount: Map<string, number>): boolean {
        const ranks = Array.from(rankCount.keys()).map(rank => this.rankValue(rank)).sort((a, b) => a - b);
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
            'J': 11,
            'Q': 12,
            'K': 13,
            'A': 14,
        };
        return rankValues[rank] || 0;
    }

    private getPairs(rankCount: Map<string, number>): string[] {
        return Array.from(rankCount.entries()).filter(([_, count]) => count === 2).map(([rank]) => rank);
    }

    private getThreeOfAKind(rankCount: Map<string, number>): boolean {
        return Array.from(rankCount.values()).some(count => count === 3);
    }

    private getFourOfAKind(rankCount: Map<string, number>): boolean {
        return Array.from(rankCount.values()).some(count => count === 4);
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
                const handStrength = this.evaluateHand(
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
