---
layout: post
title: "The Empirical Analysis of Chess Search Algorithms Used in Menso, the C Chess Engine"
date: 2026-10-25
description: "My thoughts on the necessity of Negamax, Alpha beta pruning, Move Ordering and Quiesence Search with Data to measure its impact on the engine. "
---
I started [this project](https://github.com/Titan-06/ChessEngine) on 15th September, a bit after I finished working on a [mark and sweep GC](https://github.com/Titan-06/garbageCollector-C). I keep a list of projects I want to work on in my notes app, and scrolling through it, the chess engine seemed really interesting. I got that idea initially after seeing [sameshi](https://github.com/datavorous/sameshi), which is a 2KB, 1200 Elo engine. Though my goal was a bit different, I wanted to make a chess engine in 10 days, trying to maximise the Elo and see where I end up in the end.

I am writing this article a day after "completing" the chess engine on 23 October. Yep... it took me way more than a month. One reason for that is that my midsems exam got in the way :P

The other reason was a shift in how I made projects. Rather than implementing things that supposedly made the project better, I wanted to question things more. I began making the engine with these questions in mind:

- Why did it need to be implemented?
- What other ways are there to implement this? (a basic idea is enough but this is something that I still couldn't do properly for this project)
- How exactly did it impact the project? (With some form of measurement rather than just how it feels)

This article summarises what prompted me to add the algorithms/optimisations and exactly how they impacted the engine, with proper data (and some of my hypotheses about why we got those numbers).

A shorter, more formal version of the experimental analysis is available in analysis.md in the [repository](https://github.com/Titan-06/ChessEngine).

Though, before making the engine, we have to make the game first. Let's go over quickly what resources I used and what hurdles I faced while making the game (Spoiler: It was a lot).

---

## Making the Game

Most of the time actually went into making the game, though that was mostly fighting a lot of bugs and handling edge cases. It's tough making the game when you don't even know many of the rules yourself :<

My only real resources were the [Chess Programming Wiki](https://www.chessprogramming.org/) and AI tools to help me grasp things.

### First Learning: Board Representation

I went with [**0x88**](https://www.chessprogramming.org/0x88).

The three major ways are **Mailbox**, **0x88** and **Bitboards**.

[Bitboards](https://chessprogramming.org/Bitboards) are used by almost all the big chess engines, but they were notoriously difficult to understand. Given the 10-day timeframe, I dropped this immediately.

[Mailboxes](https://chessprogramming.org/Mailbox) and 0x88 are similar, but 0x88 gets the math and off-board checking done quickly with binary operations, which I also wanted to practice at that time.

### Second Learning: Special Moves

Handling the special moves (en passant, castling, etc.).

I missed a lot of edge cases that came back to bite me later when I started checking things with the [perft function](https://www.chessprogramming.org/Perft). It's important to test them out thoroughly when you implement them before moving on to the next one. And that really goes for any complex project you build.

### Third Learning: Checkmate and Stalemate

Implementing checkmate and stalemate is one and the same thing. In both cases you don't have any legal moves left, but in one you're in check and in the other you're not.

Checking legal moves was something I was trying to avoid because then I would have to loop through the board 128 × 128 times (not really... I optimised this later, but that's what I thought at the time).

I spent a whole day scratching my head to figure out some other way to do this, and in the end, I just had to go with this. This function would also be of tremendous use later on in the engine.

That wraps up the game-making experience.

A few things I **didn't implement** should be kept in mind:

- Threefold repetition: The engine actually has no concept of repetition, so it will get into a lot of draws even in positions that might seem winning.

- 50-move rule and insufficient material: This is handled by [cutechess-cli](https://github.com/cutechess/cutechess), but since the engine doesn't know any of this, it can't avoid it.

**Note:** When I use words like "move" and "depth" later in the article, I mean one ply (a move made by one player).

---

## The Engine

The heart and soul of the engine are **[evaluation](https://chessprogramming.org/Evaluation)** and **[search](https://chessprogramming.org/Search)**.

Both need to be considered when making an engine. But in smaller engines like mine, I went with a simple evaluation. It is just calculating material and positional advantage, which is enough. Giving it more heuristic knowledge requires more checks, which will make the speed of depth search lower. An engine with all the heuristic knowledge about the game at a lower depth usually loses to an engine with only material scores and a higher depth search.

No matter how well it can evaluate the current position, it will never see a 7–8-move checkmate coming, simply because it doesn't have that depth.

This is what they look like:

```c
/* Weights for all pieces*/
enum weights{
    kingWt = 999,
    queenWt = 90,
    rookWt = 50,
    bishopWt = 30,
    knightWt = 30,
    pawnWt = 10,

};

/* Weight for the squares in each piece */

// PAWN: Encourages pushing central pawns and marching toward promotion.
const int pawn_pst[64] = {
     0,  0,  0,  0,  0,  0,  0,  0, // Rank 1
     5, 10, 10,-20,-20, 10, 10,  5, // Rank 2
     5, -5,-10,  0,  0,-10, -5,  5, // Rank 3
     0,  0,  0, 20, 20,  0,  0,  0, // Rank 4
     5,  5, 10, 25, 25, 10,  5,  5, // Rank 5
    10, 10, 20, 30, 30, 20, 10, 10, // Rank 6
    50, 50, 50, 50, 50, 50, 50, 50, // Rank 7
     0,  0,  0,  0,  0,  0,  0,  0  // Rank 8 (Promoted)
};

// KNIGHT: Heavy penalties on the edge, massive bonus in the center.
const int knight_pst[64] = {
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
};

// BISHOP: Wants to sit on long central diagonals.
const int bishop_pst[64] = {
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
};

// ROOK: Minor bonus for central files, major bonus for reaching the 7th rank.
const int rook_pst[64] = {
      0,  0,  0,  5,  5,  0,  0,  0,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      5, 10, 10, 10, 10, 10, 10,  5, // 7th Rank infiltration
      0,  0,  0,  0,  0,  0,  0,  0
};

// QUEEN: Prefers not to develop too early, stays slightly centralized.
const int queen_pst[64] = {
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
};

// KING (Middlegame): Extreme penalty for wandering to the center; bonuses for castling.
const int king_pst[64] = {
     20, 30, 10,  0,  0, 10, 30, 20, // High bonus at c1 and g1
     20, 20,  0,  0,  0,  0, 20, 20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30
};

/* The Evaluation Function , Materials are REALLY important */
int evaluate_score(){
    int square_wt = 5;
    int piece_wt = 100;

    int player = (GAMESTATE.current_player == 1) ? 1 : -1;

    int eval = (square_wt * GAMESTATE.square_score + piece_wt * GAMESTATE.piece_score) * player;

    return eval;
}

```

The piece-square table is taken from the [Chess Programming Wiki](https://www.chessprogramming.org/), and we are using one table for each piece, which is not exactly ideal. The positional advantage can differ a lot between the middlegame and the endgame.


So now, we will only concern ourselves with the search part.

---

## Test Positions

The positions I used can be found [here](https://chessprogramming.org/Perft_Results). They cover various scenarios, which is ideal for getting the most out of our testing.

| # | Position | Why it's used |
|---|----------|---------------|
| 1 | The Starting position | No capturing moves, but all pieces are available on the board. |
| 2 | Kiwipete position | The most chaotic board and the ultimate stress test. It yields an extraordinary number of legal moves even at smaller depths. |
| 3 | Rook and King endgame | This focuses heavily on rook-and-king endgames. |
| 4 | Complex middlegame | En passant, pawn promotions and back-rank tactics. |
| 5 | Edge case position | This position caught bugs in many engines. Includes a lot of edge cases and tests endgame handling. |
| 6 | Tactical position | It has really deep tactical branching, is perfectly symmetrical, and has no immediate captures or special moves. |


**Hardware and software**

- CPU: Intel® Core™ i3-6006U CPU @ 2.00 GHz, 2-core, 4-thread chip
- OS: Fedora Linux 44
- Compiler: gcc (GCC) 16.2.1 20260819 with the `-O2` flag
- Timing: `clock()` from `time.h`, **single run** per position

---
## Search Algorithms

We will implement four search algorithms in this order:

**Negamax → Alpha-Beta Pruning → Move Ordering (MVV-LVA) → Quiescence Search**

I will examine why each was necessary and use metrics to show how it impacted the engine.

The metrics we will use are:

- **Nodes Searched**
- **Time Spent**
- **NPS** (Nodes per Second)
- **EBF** (Effective Branching Factor) - caculated with (Nodes)^(1/depth)

## 1. Negamax

This is the first of the four algorithms we will implement for search. It has a sibling, [minimax](https://chessprogramming.org/Minimax), and there is really no difference in performance; the only difference is how you understand it. [Negamax](https://chessprogramming.org/Negamax) is just kind of hard to understand, but you only have to make one function for it. It's a depth-first search of the move tree.

This is where we go from game to engine. It will be considered the **baseline** for the algorithms we will later implement.

The data we got at depths 4 and 5 for all the different positions are as follows:



### Depth 4 Search Results

  | Positions | Nodes | Time spent (s) | NPS | EBF |
  | :---: | :---: | :---: | :---: | :---: |
  | 1 | 206603 | 0.316 | 653684.913 | 21.32 |
  | 2 | 4185552 | 4.628 | 904318.247 | 45.23 |
  | 3 | 46255 | 0.071 | 652498.977 | 14.68 |
  | 4 | 432070 | 0.461 | 936564.536 | 25.64 |
  | 5 | 2167396 | 2.526 | 857904.420 | 38.37 |
  | 6 | 3986609 | 4.300 | 927101.986 | 44.68 |



### Depth 5 Search Results

  | Positions | Nodes | Time spent (s) | NPS | EBF |
  | :---: | :---: | :---: | :---: | :---: |
  | 1 | 5072212 | 6.666 | 760917.365 | 21.94 |
  | 2 | 197876242 | 212.896 | 929449.825 | 45.28 |
  | 3 | 720879 | 0.904 | 797423.701 | 14.85 |
  | 4 | 16265362 | 18.434 | 882355.858 | 27.57 |
  | 5 | 92108590 | 97.116 | 948434.258 | 39.30 |
  | 6 | 168062160 | 179.732 | 935069.790 | 43.83 |

  Right off the bat, there are two really interesting observations we can make here:
  
  - Position 3 has the lowest EBF, which makes sense considering its features, as it is an endgame position.
  - Positions 2, 4, 5, and 6 have a higher NPS. I believe the reason is a higher leaf count due to more branching than in the other two positions, since those are the starting position and an endgame. Leaf nodes don't need to generate legal moves, which is the time-consuming part in parent nodes. This makes them cheaper to process, bringing NPS up (this becomes important when analysing data in later sections as well!).

  Negamax evaluates EVERY SINGLE NODE of the tree to whatever depth we want it to. But is that really necessary? Some moves definitely put us in a much better position, so we don't need to go down other move paths, and some moves are so bad that we should assume the opponent will never play them. This is where we further add [**Alpha-Beta Pruning**](https://www.chessprogramming.org/Alpha-Beta) to solve this problem.

  ## 2. Alpha-Beta Pruning
  The node count becomes huge in any position where there are a lot of legal moves to play, but not every move is worth playing. We need to cut (prune) down the tree so we only look into moves that are worth it and put us in a better position down the line, considering that the opponent also plays their best move.

  Once it is implemented, this is what the data looks like at depths 4 and 5 on the same positions we used:
  


### Depth 4 Search Results

  | Positions | Nodes | Time spent (s) | NPS | EBF |
  | :---: | :---: | :---: | :---: | :---: |
  | 1 | 8258 | 0.028 | 291092.390 | 9.53 |
  | 2 | 43354 | 0.151 | 286913.074 | 14.43 |
  | 3 | 1419 | 0.006 | 245331.950 | 6.14 |
  | 4 | 7487 | 0.025 | 302627.324 | 9.30 |
  | 5 | 28982 | 0.095 | 303708.594 | 13.05 |
  | 6 | 62474 | 0.277 | 225446.750 | 15.81 |



### Depth 5 Search Results

  | Positions | Nodes | Time spent (s) | NPS | EBF |
  | :---: | :---: | :---: | :---: | :---: |
  | 1 | 216592 | 0.408 | 530910.891 | 11.67 |
  | 2 | 912672 | 2.167 | 421073.611 | 15.56 |
  | 3 | 21287 | 0.058 | 369681.498 | 7.34 |
  | 4 | 50422 | 0.273 | 184735.218 | 8.72 |
  | 5 | 868574 | 1.423 | 610428.191 | 15.41 |
  | 6 | 2580926 | 4.205 | 613707.786 | 19.16 |

  HUGE DIFFERENCE :O

  Let's talk about the stuff that stands out!
  
  - Previously, position 2 was the one taking more time, but now it is position 6. We can also see the difference in node count and EBF. The reason might come down to the symmetry and the lack of special moves in position 6. There are no obvious good moves for the algorithm to rule out and prune the rest, so it has to look at more nodes all the way to the specified depth, causing its EBF and node count to go up. 

  - The overall NPS went down. I believe this is due to the overhead of the additional checks performed in alpha-beta pruning, along with more internal nodes and fewer leaf nodes, which add up to make NPS slower.

  - The NPS is so different at depth 4 versus depth 5. This is actually the trend for later sections as well. I couldn't figure this out. Further testing will be needed here.

  The major thing we can take from here is that we finally reduced the massive number of nodes being evaluated:



### Depth 4: Node Count Reduction (v1 vs. v2)

| Position | v1 Nodes (Negamax) | v2 Nodes (Alpha-Beta) | Node Reduction (%) |
| :---: | :---: | :---: | :---: |
| **1** | 206,603 | 8,258 | 96.00% |
| **2** | 4,185,552 | 43,354 | 98.96% |
| **3** | 46,255 | 1,419 | 96.93% |
| **4** | 432,070 | 7,487 | 98.27% |
| **5** | 2,167,396 | 28,982 | 98.66% |
| **6** | 3,986,609 | 62,474 | 98.43% |



### Depth 5: Node Count Reduction (v1 vs. v2)

| Position | v1 Nodes (Negamax) | v2 Nodes (Alpha-Beta) | Node Reduction (%) |
| :---: | :---: | :---: | :---: |
| **1** | 5,072,212 | 216,592 | 95.73% |
| **2** | 197,876,242 | 912,672 | 99.54% |
| **3** | 720,879 | 21,287 | 97.05% |
| **4** | 16,265,362 | 50,422 | 99.69% |
| **5** | 92,108,590 | 868,574 | 99.06% |
| **6** | 168,062,160 | 2,580,926 | 98.46% |

From the previous points, we can see that it becomes tough for alpha-beta pruning to cut branches if there aren't any obvious captures or good moves. The way it's choosing moves now is more or less random. It might get a really good move at the start and cut everything after it, saving a ton of compute, or it might get that good move at the end and have to evaluate every single branch before it.

We need to give it the more aggressive moves first, such as captures and en passant. They have a higher chance of being good moves than quiet moves that don't capture anything. From this, the need for some sort of move ordering arises. Thus, we introduce [MVV-LVA](https://www.chessprogramming.org/MVV-LVA) (Most Valuable Victim – Least Valuable Attacker).

  ## 3. MVV-LVA

The idea here is that once we generate the legal moves for a player, we sort them according to the Most Valuable Victim (QUEEN -> ROOK -> KNIGHT -> BISHOP -> PAWN) and the Least Valuable Attacker (PAWN -> BISHOP -> KNIGHT -> ROOK -> QUEEN -> KING). When capturing, we look for the most material points we can get while using a piece that is worth the least to us. This doesn't guarantee that the first move will be the best move, but it increases the chance of getting a good move at the start of the search.

Are there better ways or additional things we can do for better move ordering? Yes. Right now, we are only concerning ourselves with captures and sorting them, leaving the quiet moves as they are. But move ordering has a lot of techniques, though in the timeframe I had, this suffices.

The data from this version are as follows:



### Depth 4 Search Results

| Positions | Nodes | Time spent (s) | NPS | EBF |
| :---: | :---: | :---: | :---: | :---: |
| 1 | 7328 | 0.029 | 253108.594 | 9.25 |
| 2 | 7231 | 0.074 | 97086.467 | 9.22 |
| 3 | 702 | 0.004 | 157717.367 | 5.15 |
| 4 | 5612 | 0.019 | 288638.585 | 8.66 |
| 5 | 5051 | 0.041 | 122205.555 | 8.43 |
| 6 | 19164 | 0.090 | 212489.466 | 11.77 |



### Depth 5 Search Results

| Positions | Nodes | Time spent (s) | NPS | EBF |
| :---: | :---: | :---: | :---: | :---: |
| 1 | 93084 | 0.308 | 302625.590 | 9.86 |
| 2 | 89208 | 0.288 | 309758.604 | 9.77 |
| 3 | 6201 | 0.019 | 333620.272 | 5.73 |
| 4 | 23244 | 0.186 | 124987.901 | 7.47 |
| 5 | 71666 | 0.160 | 448456.253 | 9.36 |
| 6 | 346175 | 1.204 | 287449.618 | 12.82 |

This is interesting... the node count and NPS both went down, with some positions showing a bigger change than others. 

- The different nature of the positions is one factor, and it's also due to MVV-LVA being just one part of the solution to the whole move-ordering problem. Just sorting the moves based on captures and material points is good, but not enough. Thus, there is very little consistency in the results here. For some positions MVV-LVA worked well but for some not much.

- Position 6 still stands out due to its higher EBF, but it does get a good percentage of node reduction (table below).

- Position 1 has the smallest percentage reduction, since it is the starting position.

Let's look at the data for node reduction across all the positions:



### Depth 4: v3 (MVV-LVA) Node Reduction vs. v1 and v2

| Position | v1 Nodes (Negamax) | v2 Nodes (Alpha-Beta) | v3 Nodes (MVV-LVA) | Reduction vs v1 (%) | Reduction vs v2 (%) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | 206,603 | 8,258 | 7,328 | 96.45% | 11.26% |
| **2** | 4,185,552 | 43,354 | 7,231 | 99.83% | 83.32% |
| **3** | 46,255 | 1,419 | 702 | 98.48% | 50.53% |
| **4** | 432,070 | 7,487 | 5,612 | 98.70% | 25.04% |
| **5** | 2,167,396 | 28,982 | 5,051 | 99.77% | 82.57% |
| **6** | 3,986,609 | 62,474 | 19,164 | 99.52% | 69.32% |



### Depth 5: v3 (MVV-LVA) Node Reduction vs. v1 and v2

| Position | v1 Nodes (Negamax) | v2 Nodes (Alpha-Beta) | v3 Nodes (MVV-LVA) | Reduction vs v1 (%) | Reduction vs v2 (%) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | 5,072,212 | 216,592 | 93,084 | 98.16% | 57.02% |
| **2** | 197,876,242 | 912,672 | 89,208 | 99.95% | 90.23% |
| **3** | 720,879 | 21,287 | 6,201 | 99.14% | 70.87% |
| **4** | 16,265,362 | 50,422 | 23,244 | 99.86% | 53.90% |
| **5** | 92,108,590 | 868,574 | 71,666 | 99.92% | 91.75% |
| **6** | 168,062,160 | 2,580,926 | 346,175 | 99.79% | 86.59% |

We have implemented a good number of algorithms to make the search faster at a fixed depth. This helps the engine reach deeper into the move tree, but the engine is still prone to making some really dumb mistakes. We are talking about the ones involving a long capturing sequence. It might be winning material after some captures, but if it doesn't evaluate that until the end of the capturing sequence, it might think that it's actually losing. This is called the [horizon effect](https://www.chessprogramming.org/Horizon_Effect).

> "The Horizon Effect is caused by the depth limitation of the search algorithm, and became manifest when some negative event is inevitable but postponable. Because only a partial game tree has been analyzed, it will appear to the system that the event can be avoided when in fact this is not the case." - From the [Chess Programming Wiki](https://www.chessprogramming.org/Horizon_Effect)

Is the answer to that adding more heuristic knowledge, as we discussed in the search-vs-evaluation section? Maybe, but we shouldn't evaluate using various different heuristics at every branch if we only want to evaluate some capturing moves at the end of our alpha-beta search.

What if we just look ahead when we encounter capturing moves at the end of the alpha-beta search and continue until there aren't any capturing moves left? This will help us avoid slowing down the evaluation of every single node in the tree when there is no need for it. This is where we add Quiescence search.

## 4. Quiescence Search
[Quiescence Search](https://www.chessprogramming.org/Quiescence_Search) looks into further capturing moves after your fixed depth search ends and it does so without any fixed depth. It will go until it doesn't have any capturing moves to look into.

Thus, this would be very different from the previous three. Before, we were trying to reduce the node count and time spent. Now, with this search, the node count will increase A LOT!

In fact, it increased so much in position 2 that I wasn't able to get any data at even depth 3. This is something called move explosion, which normal quiescence search is prone to. Since it doesn't have a fixed depth, it keeps going down the move tree until there aren't any capture moves left. In positions with many capturing moves, the search takes a VERY long time. Thus, I couldn't get any data on how much slower it was.

I needed to fix this first, so I did three major things to try to make the search faster:

- Delta Pruning: Similar to alpha-beta pruning, it tells quiescence search to stop searching if we are already at a big material disadvantage. Basically, if we are already doomed in some branch it stops looking. The 9000 comes from the weight of the queen, and 500 is just a margin to say it should be a bit more than that.

``` 
  // Delta pruning 
  int big_delta = 9500; // The weight of the queen (don't look further when already down a lot of points)
  if(static_eval < alpha - big_delta){
      return alpha;
  }
```
- I limited the quiescence search to **depth 2** after alpha-beta pruning as well. This does reduce the effectiveness of quiescence search, since now it's not really evaluating **till the end**
- Generating legal moves: I was using the same function to generate every legal move for a player, but for quiescence search, I only needed the capturing moves. So I designed the function to take one extra parameter to either get all moves or only capturing moves.

**One thing to note:** MVV-LVA is implemented inside the legal-move generation function. So the work of copying and pasting the quiet moves at the end was also cut down.

All these changes actually made the entire search faster because nodes in quiescence search were cheaper to go through than normal moves in alpha-beta pruning, so NPS increased. Though, since I added all of them together, I couldn't test how much each contributed to making the search faster. My guess is that the fixed depth of 2 helped, but yeah, further testing will be needed here.



### Depth 4 Search Results

| Positions | Nodes | Time spent (s) | NPS | EBF |
| :---: | :---: | :---: | :---: | :---: |
| 1 | 14668 | 0.055 | 266148.933 | 11.01 |
| 2 | 23677 | 0.108 | 218644.381 | 12.40 |
| 3 | 2409 | 0.009 | 255569.701 | 7.01 |
| 4 | 13278 | 0.026 | 518105.197 | 10.74 |
| 5 | 8443 | 0.047 | 180286.562 | 9.58 |
| 6 | 43901 | 0.141 | 310254.417 | 14.48 |



### Depth 5 Search Results

| Positions | Nodes | Time spent (s) | NPS | EBF |
| :---: | :---: | :---: | :---: | :---: |
| 1 | 138809 | 0.441 | 314871.734 | 10.68 |
| 2 | 189619 | 0.391 | 484942.956 | 11.37 |
| 3 | 12582 | 0.026 | 481423.379 | 6.61 |
| 4 | 33806 | 0.173 | 195952.956 | 8.05 |
| 5 | 139968 | 0.205 | 683460.860 | 10.70 |
| 6 | 643438 | 1.675 | 384050.605 | 14.51 |

The data really reflects the essence of quiescence search:

- The number of nodes increased because of quiescence search after alpha-beta pruning. Thus, EBF also increased.

- NPS went up because the nodes in quiescence search were cheaper to process.

- The numbers fluctuate a bit across positions and depths, depending on how many capturing moves were available after the fixed-depth search.



### Depth 4: Node Expansion (v3 vs. v4)

| Position | v3 Nodes (MVV-LVA) | v4 Nodes (Quiescence) | Additional Nodes | Node Increase (%) |
| :---: | :---: | :---: | :---: | :---: |
| **1** | 7,328 | 14,668 | +7,340 | +100.16% |
| **2** | 7,231 | 23,677 | +16,446 | +227.44% |
| **3** | 702 | 2,409 | +1,707 | +243.16% |
| **4** | 5,612 | 13,278 | +7,666 | +136.60% |
| **5** | 5,051 | 8,443 | +3,392 | +67.15% |
| **6** | 19,164 | 43,901 | +24,737 | +129.08% |



### Depth 5: Node Expansion (v3 vs. v4)

| Position | v3 Nodes (MVV-LVA) | v4 Nodes (Quiescence) | Additional Nodes | Node Increase (%) |
| :---: | :---: | :---: | :---: | :---: |
| **1** | 93,084 | 138,809 | +45,725 | +49.12% |
| **2** | 89,208 | 189,619 | +100,411 | +112.56% |
| **3** | 6,201 | 12,582 | +6,381 | +102.90% |
| **4** | 23,244 | 33,806 | +10,562 | +45.44% |
| **5** | 71,666 | 139,968 | +68,302 | +95.31% |
| **6** | 346,175 | 643,438 | +297,263 | +85.87% |

Great! Now we are taking more time to make a move...

Though, unlike the three previous algorithms, which gave us the same move just faster, quiescence search should make the engine choose much smarter moves at the same fixed depth if a tactical situation arises. 

And I got the data to support this!

## v4 (Quiescence) vs v3 (MVV-LVA)

I put both engines against each other across 100 games. To avoid repeating the same games, I used [openings.pgn]() to test them properly in multiple situations with [cutechess-cli](https://github.com/cutechess/cutechess). The v4 engine looks at more nodes and spends a bit more time than v3, but the conclusion still holds.

v4 should be smarter than v3, right? Let's see how the games went.

**Note:** I couldn't implement iterative deepening and time management for the bot. So all games were played at a fixed depth of 5 with an infinite time control.



### Match Summary: v4_quiesce vs. v3_mvvlva

| Matchup | Result (W - L - D) | Score | Total Games |
| :--- | :---: | :---: | :---: |
| **Total Score (v4 vs. v3)** | 46 – 3 – 51 | 71.5 / 100 (0.715) | 100 |
| **v4_quiesce playing White** | 18 – 0 – 32 | 34.0 / 50 (0.680) | 50 |
| **v4_quiesce playing Black** | 28 – 3 – 19 | 37.5 / 50 (0.750) | 50 |
| **White vs. Black** | 21 – 28 – 51 | 46.5 / 100 (0.465) | 100 |



### Match Statistics

| Metric | Value |
| :--- | :--- |
| **Elo difference** | +159.8 +/- 46.5 |
| **LOS (Likelihood of Superiority)** | 100.0% |
| **DrawRatio** | 51.0% |



### Game Terminations (v4_quiesce)

| Condition | Count |
| :--- | :---: |
| **Draw by threefold repetition** | 51 |
| **Win: Black mates** | 28 |
| **Win: White mates** | 18 |
| **Loss: White mates** | 3 |
| **Loss: Black mates** | 0 |

It's safe to say v4 wiped the floor with v3. In the games v3 won, my guess is that it was because of the first-move advantage, since v3 was White in all those games. The only difference between the two versions is quiescence search. Due to repetition, there are a lot of drawn games as well.

**We know for sure that v4 is better than v3, but the Elo difference of ~160 +/- 46.5 shouldn't be taken at face value due to the limitation I mentioned in the note.**

---

## The initial goal

The initial goal was to see how much Elo my engine could achieve within the 10-day timeframe. Though it ended up taking a month, I was focused on midsems and later wanted to test it more empirically. But after quiescence search (v4), I considered the project to be over. I didn't want to add anything new to it, so I tried to test its Elo as it was.

Since the engine doesn't have iterative deepening or a concept of time control, I had to test it at a fixed depth of 5. This is faulty in itself, since Elo is more of a measure of how it will play in a tournament setting, but here we make it play with an infinite time control.

I made it play 400 games against four bots, with 100 games per bot. The bot chosen was [Stockfish](https://stockfishchess.org/), which was crippled to fixed Elo limits of 2000, 1800, 1600, and 1400, all at a depth of 5.

I still wanted to see how it would rank among the most popular chess engines under those settings. The command used was:
```
cutechess-cli -tournament gauntlet \
-engine name="v4_quiesce" cmd="(Some Path)" proto=uci \
 -engine name=SF1400 cmd="(Some Path)" proto=uci option.UCI_LimitStrength=true option.UCI_Elo=1400 \
 -engine name=SF1600 cmd="(Some Path)" proto=uci option.UCI_LimitStrength=true option.UCI_Elo=1600 \
 -engine name=SF1800 cmd="(Some Path)" proto=uci option.UCI_LimitStrength=true option.UCI_Elo=1800 \
 -engine name=SF2000 cmd="(Some Path)" proto=uci option.UCI_LimitStrength=true option.UCI_Elo=2000 \
 -each tc=inf depth=5 \
 -rounds 50 -games 2 -repeat -concurrency 2 -recover \
 -openings file="/home/titan_06/Downloads/MyChessEngines/openings.pgn" format=pgn order=random -ratinginterval 20 -pgnout "/home/titan_06/Downloads/MyChessEngines/results_vs_stockfish.pgn"
```

This is how it went:


### Rating table

| Rank | Player | Elo (relative to SF1800 = 0) | +/- (margin of error) | Games played | Score (wins + ½ per draw, as % of games) | Draws (% of games drawn) |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|
| 0 | v4_quiesce | 94 | 33 | 400 | 63.2% | 14.0% |
| 1 | SF2000 | 96 | 65 | 100 | 63.5% | 17.0% |
| 2 | SF1800 | 0 | 61 | 100 | 50.0% | 22.0% |
| 3 | SF1600 | -160 | 73 | 100 | 28.5% | 9.0% |
| 4 | SF1400 | -512 | 140 | 100 | 5.0% | 8.0% |



### v4_quiesce record by opponent

| Opponent | Wins | Draws | Losses | Score |
|:---:|:---:|:---:|:---:|:---:|
| SF1400 | 91 | 8 | 1 | 95.0% |
| SF1600 | 67 | 9 | 24 | 71.5% |
| SF1800 | 39 | 22 | 39 | 50.0% |
| SF2000 | 28 | 17 | 55 | 36.5% |
| **Total** | **225** | **56** | **119** | **63.2%** |



### How the games ended

Each column is counted from that player's own point of view.

| Result | v4_quiesce | SF1400 | SF1600 | SF1800 | SF2000 |
|:---|:---:|:---:|:---:|:---:|:---:|
| Draw by threefold repetition | 45 | 7 | 7 | 19 | 12 |
| Draw by the fifty-move rule | 6 | 0 | 0 | 2 | 4 |
| Draw by insufficient mating material | 4 | 1 | 1 | 1 | 1 |
| Draw by stalemate | 1 | 0 | 1 | 0 | 0 |
| Win: White mates | 120 | 1 | 12 | 24 | 27 |
| Win: Black mates | 105 | 0 | 12 | 15 | 28 |
| Loss: White mates | 64 | 47 | 34 | 23 | 16 |
| Loss: Black mates | 55 | 44 | 33 | 16 | 12 |

**Considering that the Elo column is relative, v4 is about 94 Elo above Stockfish at 1800 Elo.**

So can we say plainly that the engine is ~1894 Elo? Not exactly...

- Stockfish levels aren't evenly spaced out as they should be, considering 1800 as 0. This could be due to how we forced it to play at a fixed depth with an infinite time control, and to the fact that it's a gauntlet run, so each bot only played against our engine.

- The Elo is relative to Stockfish's Elo limit at a fixed depth of 5, so this can't be compared to, let's say, a [Lichess](https://lichess.org/) Elo rating.

A more accurate way of saying this would be that **it scored 50% against Stockfish 1800 and is placed somewhere between Stockfish at 1800 and 2000 when the depth is fixed at 5. We can't really give any precise numbers at this stage.**

---

If I ever get back to this project, or if I had more time, these should be the next steps:
1. **Threefold repetition**, so it stops throwing away winning positions.
2. **Iterative deepening and time management**, so it can be tested at real time controls and not only at fixed depth.
3. **Better move ordering:** killer moves, history heuristic, etc.
4. **An endgame king table**, since the current one only suits the middlegame.
5. **Measuring each quiescence fix on its own**, and counting leaf and internal nodes to check my explanations. This could have been done during the project, but I realise my inexperience meant I didn't think to count them properly at the time.

Making a chess engine was a really fun experience. It felt good when I lost against it for the first time :)

The initial 10-day timeframe extended to a month, but I definitely learned a lot. I will be applying the same framework of questioning and testing things more empirically in all projects I build from now on. Thanks to anyone who took the time to read this. The upcoming write-ups will be even better!

