"""The transform between grams and what the network regresses.

Everything here is about one failure mode: a target transform that is applied
in one place and undone slightly differently in another. It does not crash and
it does not show up in the loss curve. It shows up as a model that is wrong by
a factor, reporting a plausible calorie count on a screen someone is using to
decide whether they can eat something.

Four callers have to agree — train, eval, predict, export — which is why the
codec is one object that carries its own inverse.
"""
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from targets import SPACES, TargetCodec, fit_stats, from_space, to_space  # noqa: E402

FIELDS = ["calories", "mass", "fat", "carb", "protein"]


def sample_targets(n=400, seed=0):
    """Right-skewed positive values, shaped like the real dish distribution."""
    rng = np.random.default_rng(seed)
    return np.stack([
        rng.gamma(2.0, 130.0, n),   # calories
        rng.gamma(2.2, 100.0, n),   # mass
        rng.gamma(1.4, 9.0, n),     # fat
        rng.gamma(1.6, 12.0, n),    # carb
        rng.gamma(1.5, 12.0, n),    # protein
    ], axis=1)


@pytest.mark.parametrize("space", SPACES)
def test_the_transform_is_exactly_invertible(space):
    y = sample_targets()
    back = from_space(to_space(y, space), space)
    assert np.allclose(back, y, rtol=1e-9, atol=1e-9)


@pytest.mark.parametrize("space", SPACES)
def test_the_codec_round_trips_in_physical_units(space):
    y = sample_targets()
    codec = TargetCodec(space, *fit_stats(y, space))
    assert np.allclose(codec.decode(codec.encode(y)), y, rtol=1e-6, atol=1e-6)


@pytest.mark.parametrize("space", SPACES)
def test_numpy_and_torch_agree(space):
    # The training loop encodes with torch tensors on the GPU; eval decodes
    # numpy on the host. A disagreement between the two paths would be a
    # constant offset in every reported number.
    y = sample_targets(64)
    codec = TargetCodec(space, *fit_stats(y, space))

    np_out = codec.decode(codec.encode(y))
    t_out = codec.decode(codec.encode(torch.tensor(y, dtype=torch.float64))).numpy()
    assert np.allclose(np_out, t_out, rtol=1e-9, atol=1e-9)


@pytest.mark.parametrize("space", SPACES)
def test_standardized_targets_are_actually_standardized(space):
    # The whole point of the transform is a loss that weighs five fields on
    # wildly different scales evenly. If a field came out with std 40, it would
    # own the gradient and the other four would be noise.
    y = sample_targets(4000)
    codec = TargetCodec(space, *fit_stats(y, space))
    z = codec.encode(y)
    assert np.allclose(z.mean(axis=0), 0, atol=1e-6)
    assert np.allclose(z.std(axis=0), 1, atol=1e-6)


def test_negative_predictions_are_clamped_not_reported():
    # A linear head can output anything. Nothing on a plate weighs a negative
    # number of grams, and a negative value would corrupt the day's running
    # total in the app rather than look like a single obviously wrong reading.
    codec = TargetCodec("identity", np.zeros(5), np.ones(5))
    very_negative = np.full((3, 5), -50.0)
    assert (codec.decode(very_negative) == 0).all()
    assert (codec.decode(torch.tensor(very_negative)).numpy() == 0).all()


def test_outlier_clipping_moves_the_statistics_not_the_samples():
    """The distinction the training loop depends on.

    Carbohydrate reaches 845 g against a 99th percentile of 68 g. Those rows
    must not set the scale for every other dish — but they must still be
    trained against. Clipping the targets themselves would teach the model to
    under-predict large dishes, which is the opposite of the intent.
    """
    y = sample_targets(2000)
    y[0] = [50000, 40000, 4000, 5000, 4000]      # one absurd row

    mean_all, std_all = fit_stats(y, "identity", clip_percentile=None)
    mean_clip, std_clip = fit_stats(y, "identity", clip_percentile=99.0)

    # The outlier dragged the uncapped statistics; the capped ones resist it.
    assert (std_clip < std_all).all()

    # And the sample itself is untouched — encoding it still produces the large
    # value it should, rather than something capped.
    codec = TargetCodec("identity", mean_clip, std_clip)
    assert np.allclose(codec.decode(codec.encode(y))[0], y[0], rtol=1e-6)


def test_a_constant_field_does_not_divide_by_zero():
    # Guards a real crash: a subset in which some field never varies gives a
    # standard deviation of zero.
    y = sample_targets(50)
    y[:, 2] = 7.0
    mean, std = fit_stats(y, "identity")
    assert std[2] == 1.0
    codec = TargetCodec("identity", mean, std)
    assert np.isfinite(codec.encode(y)).all()


def test_log_space_handles_zero_and_never_produces_nan():
    # Real dishes have zero fat and zero carbohydrate; log(0) is not an option.
    y = sample_targets(20)
    y[0] = 0.0
    codec = TargetCodec("log1p", *fit_stats(y, "log1p"))
    z = codec.encode(y)
    assert np.isfinite(z).all()
    assert np.allclose(codec.decode(z)[0], 0.0, atol=1e-9)


def test_a_v1_checkpoint_still_decodes_the_way_it_was_trained():
    # Checkpoints written before the space was configurable have no
    # `target_space` key, and are always identity. Reading one as log-space
    # would misreport every number without failing.
    v1 = {"target_mean": [1.0] * 5, "target_std": [2.0] * 5}
    codec = TargetCodec.from_checkpoint(v1)
    assert codec.space == "identity"
    assert np.allclose(codec.decode(np.zeros((1, 5))), 1.0)


def test_the_checkpoint_round_trips_through_its_own_serialization():
    y = sample_targets()
    codec = TargetCodec("log1p", *fit_stats(y, "log1p", clip_percentile=99.5))
    restored = TargetCodec.from_checkpoint(codec.to_checkpoint())
    assert restored.space == codec.space
    assert np.allclose(restored.decode(restored.encode(y)), y, rtol=1e-6)


def test_an_unknown_space_is_refused_loudly():
    with pytest.raises(ValueError, match="unknown target space"):
        TargetCodec("logarithmic", np.zeros(5), np.ones(5))
    with pytest.raises(ValueError):
        to_space(np.zeros(5), "sqrt")
