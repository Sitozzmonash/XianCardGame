import unittest
from xiuxian.game import GameConfig, GameState
from xiuxian.agents import RandomAgent, ISMCTSAgent
from xiuxian.mccfr import MCCFRTrainer, MCCFRAgent
from xiuxian.eval import play_game

class SmokeTests(unittest.TestCase):
    def test_random_game_finishes(self):
        cfg = GameConfig(num_players=3, max_decisions=400)
        agents = [RandomAgent(1), RandomAgent(2), RandomAgent(3)]
        result = play_game(cfg, agents, seed=123)
        self.assertTrue(result.state.is_terminal())

    def test_ismcts_returns_legal_action(self):
        cfg = GameConfig(num_players=3)
        state = GameState(cfg, seed=123)
        p = state.decision_player()
        legal = state.legal_actions()
        agent = ISMCTSAgent(simulations=10, seed=7)
        action = agent.act(state, p)
        self.assertIn(action, legal)

    def test_mccfr_tiny_train(self):
        cfg = GameConfig(num_players=2, max_decisions=200)
        trainer = MCCFRTrainer(cfg, seed=5)
        trainer.train(iterations=2, workers=1, log_every=100)
        self.assertGreater(len(trainer.regret_sum), 0)
        agent = MCCFRAgent(trainer, seed=6)
        state = GameState(cfg, seed=321)
        p = state.decision_player()
        self.assertIn(agent.act(state, p), state.legal_actions())

if __name__ == "__main__":
    unittest.main()
