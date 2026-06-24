"""Unit tests for AgentRepository."""
import pytest
from app.infrastructure.agent_repository import AgentRepository, VALID_MODELS


class TestAgentRepositoryCreate:
    """Test agent creation."""

    def test_create_agent_returns_dict(self, agent_repo):
        agent = agent_repo.create("JARVIS", "Squad Lead", "claude-sonnet-4")
        assert isinstance(agent, dict)

    def test_create_agent_has_required_fields(self, agent_repo):
        agent = agent_repo.create("JARVIS", "Squad Lead", "claude-sonnet-4")
        assert "id" in agent
        assert "name" in agent
        assert "role" in agent
        assert "model" in agent
        assert "status" in agent
        assert "task" in agent
        assert "color" in agent
        assert "created_at" in agent
        assert "updated_at" in agent

    def test_create_agent_default_model(self, agent_repo):
        agent = agent_repo.create("DefaultAgent", "Worker")
        assert agent["model"] == "claude-sonnet-4"

    def test_create_agent_custom_model(self, agent_repo):
        agent = agent_repo.create("GPTAgent", "Analyst", "gpt-4o")
        assert agent["model"] == "gpt-4o"

    def test_create_agent_default_status(self, agent_repo):
        agent = agent_repo.create("NewAgent", "Worker")
        assert agent["status"] == "active"

    def test_create_agent_id_format(self, agent_repo):
        agent = agent_repo.create("My Agent", "Worker")
        assert agent["id"].startswith("my_agent_")
        assert len(agent["id"]) > len("my_agent_")

    def test_create_agent_generates_unique_ids(self, agent_repo):
        a1 = agent_repo.create("Agent1", "Worker")
        a2 = agent_repo.create("Agent2", "Worker")
        assert a1["id"] != a2["id"]

    def test_create_agent_with_color(self, agent_repo):
        agent = agent_repo.create("ColoredAgent", "Worker", color="#FF0000")
        assert agent["color"] == "#FF0000"

    def test_create_agent_default_color(self, agent_repo):
        agent = agent_repo.create("DefaultColor", "Worker")
        assert agent["color"] == "#00D4AA"


class TestAgentRepositoryRead:
    """Test agent read operations."""

    def test_get_all_empty(self, agent_repo):
        assert agent_repo.get_all() == []

    def test_get_all_returns_list(self, agent_repo, sample_agent):
        result = agent_repo.get_all()
        assert isinstance(result, list)
        assert len(result) == 1

    def test_get_all_multiple(self, agent_repo):
        agent_repo.create("A1", "Worker")
        agent_repo.create("A2", "Worker")
        agent_repo.create("A3", "Worker")
        assert len(agent_repo.get_all()) == 3

    def test_get_by_id_found(self, agent_repo, sample_agent):
        found = agent_repo.get_by_id(sample_agent["id"])
        assert found is not None
        assert found["name"] == sample_agent["name"]

    def test_get_by_id_not_found(self, agent_repo):
        assert agent_repo.get_by_id("nonexistent") is None

    def test_get_agents_ordered_by_created_at_desc(self, agent_repo):
        a1 = agent_repo.create("First", "Worker")
        a2 = agent_repo.create("Second", "Worker")
        agents = agent_repo.get_all()
        # Most recent first
        assert agents[0]["name"] == "Second"
        assert agents[1]["name"] == "First"


class TestAgentRepositoryUpdate:
    """Test agent update operations."""

    def test_update_name(self, agent_repo, sample_agent):
        updated = agent_repo.update(sample_agent["id"], name="UpdatedName")
        assert updated["name"] == "UpdatedName"

    def test_update_role(self, agent_repo, sample_agent):
        updated = agent_repo.update(sample_agent["id"], role="Lead")
        assert updated["role"] == "Lead"

    def test_update_model(self, agent_repo, sample_agent):
        updated = agent_repo.update(sample_agent["id"], model="gpt-4o")
        assert updated["model"] == "gpt-4o"

    def test_update_status(self, agent_repo, sample_agent):
        updated = agent_repo.update(sample_agent["id"], status="sleeping")
        assert updated["status"] == "sleeping"

    def test_update_invalid_model_raises(self, agent_repo, sample_agent):
        with pytest.raises(ValueError, match="Invalid model"):
            agent_repo.update(sample_agent["id"], model="invalid-model")

    def test_update_nonexistent_returns_none(self, agent_repo):
        result = agent_repo.update("nonexistent", name="Test")
        assert result is None

    def test_update_no_changes_returns_current(self, agent_repo, sample_agent):
        result = agent_repo.update(sample_agent["id"])
        assert result is not None
        assert result["name"] == sample_agent["name"]

    def test_update_multiple_fields(self, agent_repo, sample_agent):
        updated = agent_repo.update(
            sample_agent["id"],
            name="NewName",
            role="NewRole",
            model="gpt-4-turbo",
        )
        assert updated["name"] == "NewName"
        assert updated["role"] == "NewRole"
        assert updated["model"] == "gpt-4-turbo"

    def test_update_model_via_update_model(self, agent_repo, sample_agent):
        updated = agent_repo.update_model(sample_agent["id"], "gpt-4o")
        assert updated["model"] == "gpt-4o"

    def test_update_ignores_non_allowed_fields(self, agent_repo, sample_agent):
        updated = agent_repo.update(sample_agent["id"], name="Valid")
        assert updated["name"] == "Valid"


class TestAgentRepositoryDelete:
    """Test agent delete operations."""

    def test_delete_existing(self, agent_repo, sample_agent):
        assert agent_repo.delete(sample_agent["id"]) is True
        assert agent_repo.get_by_id(sample_agent["id"]) is None

    def test_delete_nonexistent(self, agent_repo):
        assert agent_repo.delete("nonexistent") is False

    def test_delete_reduces_count(self, agent_repo, sample_agent):
        agent_repo.create("Another", "Worker")
        assert len(agent_repo.get_all()) == 2
        agent_repo.delete(sample_agent["id"])
        assert len(agent_repo.get_all()) == 1


class TestAgentRepositoryValidation:
    """Test model validation constants."""

    def test_valid_models_not_empty(self):
        assert len(VALID_MODELS) > 0

    def test_contains_claude_models(self):
        assert "claude-sonnet-4" in VALID_MODELS
        assert "claude-opus-4" in VALID_MODELS

    def test_contains_gpt_models(self):
        assert "gpt-4" in VALID_MODELS
        assert "gpt-4o" in VALID_MODELS

    def test_contains_kimi_models(self):
        assert "kimi-k2" in VALID_MODELS


class TestAgentRepositoryEdgeCases:
    """Test edge cases."""

    def test_row_to_dict_has_display_fields(self, agent_repo, sample_agent):
        agent = agent_repo.get_by_id(sample_agent["id"])
        assert "seen" in agent
        assert "uptime" in agent
        assert "hb" in agent

    def test_task_field_defaults_to_idle(self, agent_repo, sample_agent):
        agent = agent_repo.get_by_id(sample_agent["id"])
        assert agent["task"] is not None
