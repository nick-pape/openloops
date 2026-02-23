# Yahtzee RL Paper — Reframing Suggestions

Feedback compiled from critical review session, 2026-02-08.

Paper: "Yahtzee: Reinforcement Learning Techniques for Stochastic Combinatorial Games" (arXiv:2601.00007)

---

## Core Reframing

**Current framing**: "Can RL play Yahtzee?" → Answer: "Mostly, except the upper bonus."

**Proposed framing**: "The bias-variance tradeoff in discount factor and return estimation concretely manifests as a measurable strategic failure in Yahtzee."

Yahtzee is uniquely suited to study this because:
- The optimal policy is known (254.59 expected score via DP)
- The failure mode is isolated to a single strategic element (upper-section bonus)
- The gap (~13 points) is almost entirely attributable to variance-reduction choices the agent is forced to make
- Every knob that reduces variance (γ<1, λ=0, TD(0) over MC) introduces bias against exactly this delayed reward

---

## What Changes

### Existing ablations reframed as central experiments

| Ablation | Current role | Reframed role |
|----------|-------------|---------------|
| GAE λ sweep (Fig 14-15) | One of many ablations | **Central experiment**: directly maps λ to bonus achievement rate, showing the tradeoff |
| Algorithm comparison (REINFORCE vs A2C vs PPO) | "Which is best?" | MC returns vs TD bootstrapping — different points on the bias-variance spectrum |
| Reward shaping (Fig 17) | Technique that helped | Attempted escape from the tradeoff — partially successful, theoretically unsound (learned potential violates Ng's conditions), honest about both |
| Pareto frontier, single-turn vs full-game (Fig 4) | Interesting side observation | Evidence that short-horizon optimization is fundamentally misaligned with bonus-seeking |
| Entropy sensitivity (Fig 16) | Hyperparameter tuning | Exploration pressure interacts with the tradeoff — too little entropy locks in the biased short-horizon policy |

### What to cut

- **The textbook RL review (Sections 2.1.1–2.1.4)**: ~2 pages explaining REINFORCE, TD, A2C, PPO, GAE basics. Any reviewer at an RL venue knows this. Replace with a tight paragraph that sets up the bias-variance framing: "Policy gradient methods face a fundamental tension in return estimation..." and cite the relevant papers.
- **The multiplayer motivation**: The intro currently promises multiplayer, the paper doesn't deliver it. This makes the solitaire work feel like a stepping stone instead of the destination. Reduce to one sentence in future work.

### What to add or expand

- **Explicitly discuss γ=0.99 vs γ=1**: The MDP formulation states γ=1, Table 6 shows γ=0.99. This contradiction should become a feature, not a bug. Discuss why γ=1 doesn't work in practice (high variance in value estimates for a stochastic dice game), what bias γ=0.99 introduces, and connect it directly to the bonus failure. If you have training curves for γ=1 attempts, show them.
- **Decompose the 13-point gap**: Break down where the gap to optimal comes from. Per-category analysis (Figures 18-19) already shows this — formalize it. How much of the gap is upper section? How much is bonus? How much is four-of-a-kind overindexing?
- **γ annealing for A2C**: REINFORCE uses γ annealing (0.95→1.0) per Table 6, but A2C doesn't. Did you try it? If not, this is a natural experiment that directly tests whether gradually extending the planning horizon helps. Either way, discuss it.

---

## Fixes (Copy-editing tier)

1. **Abstract**: "median score of 241.78" → should be "mean score" (Table 2 column header says Mean, the data confirms it's the mean)
2. **Table 2 "StdDev" column**: Contains variance values, not standard deviations (e.g., 3230.86 for A2C — sqrt gives ~56.8, consistent with known optimal std dev of ~59.6). Either relabel as Variance or convert to actual standard deviations.
3. **"Self-play" terminology**: In solitaire Yahtzee this is misleading — "self-play" in RL literature implies adversarial training against copies of yourself. Use "online learning" or "learning through simulated play" instead.

## Fixes (Substantive)

4. **PPO comparison fairness**: The paper reduces PPO's game budget by a factor of k (PPO epochs) for "fair comparison." This handicaps PPO on environment interactions. At 250K budget, PPO (seeing ~62.5K actual games) scores 230.20 vs A2C's 230.38 — essentially identical. The claim that A2C is superior needs to be qualified: "under equal compute" is different from "under equal data." Either run PPO with equal environment interactions, or reframe the comparison as compute-efficiency rather than algorithmic superiority.
5. **Multi-seed runs**: Single seed per configuration weakens the algorithm comparison claims. The A2C vs PPO difference at 250K games is 0.18 points — well within noise. At minimum, the key algorithm comparisons need 3-5 seeds with error bars and significance tests.
6. **Reward shaping + best agent**: Clarify whether the final 241.78 agent uses reward shaping or not. The shaping ablation (Fig 17) appears to use the 250K budget. Was shaping tried with the 1M-game run?

---

## Minor Issues

- **ELU on value head**: Paper says ELU "clamp[s] negative value estimates." ELU maps negatives to (-1, 0), it doesn't clamp them to zero. Softplus or ReLU would do what's described. Practically minor, but technically incorrect.
- **REINFORCE γ annealing**: Table 6 shows γ(min)=0.95, γ(max)=1.0 for REINFORCE, but the text never discusses gamma annealing. Either explain the schedule or note it.
- **Batch size**: 20 games per batch (~780 transitions) is small for policy gradient methods and likely contributes to the instability reported. Worth noting as a design choice.

---

## Venue Suggestions

- **IEEE CoG** (Conference on Games) — natural fit, this is where Glenn 2007 was published. The bias-variance framing centered on a game benchmark aligns well.
- **AAAI workshop** on games or RL benchmarks
- **Not NeurIPS/ICML main track** — the contribution is empirical/benchmark, not algorithmic

---

## State of the Art Context

- Häfner (Yahtzotron, 2021): 236 mean with A2C, but required supervised pre-training on heuristic baselines. Not pure RL.
- Dutschke: Reports 241.6 but uses hardcoded statistical heuristics dressed up as Q-learning. Not genuine RL.
- **This paper's 242 from pure online policy gradient with no heuristic initialization is the actual state-of-the-art for genuine RL on Yahtzee.** Make this claim explicitly.

---

## The One-Paragraph Elevator Pitch

> Yahtzee's optimal solitaire strategy is known via dynamic programming (254.59 expected score), making it an ideal benchmark for studying RL failure modes. We train policy gradient agents that achieve 242 points — within 5% of optimal and the best reported score from pure online RL. The entire performance gap is attributable to a single strategic element: the upper-section bonus, which requires sacrificing immediate points across multiple turns for a delayed 35-point reward. We show that every variance-reduction technique necessary for stable training (γ<1, TD(0) bootstrapping, low GAE λ) introduces bias against exactly this delayed reward. Reward shaping with a learned potential function partially mitigates the problem but violates theoretical guarantees. Our ablations systematically map the bias-variance tradeoff across discount factors, return estimators, and entropy schedules, providing concrete evidence that current policy gradient methods face a fundamental tension between trainability and long-horizon credit assignment.
