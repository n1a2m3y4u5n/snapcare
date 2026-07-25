"""Test-time augmentation, and the one thing about it that is easy to get wrong.

Averaging several flipped views is trivially correct in physical units and
subtly wrong in the network's output space. Under a log target, averaging the
raw outputs and *then* de-normalizing computes a geometric mean, which is
always at or below the arithmetic one — so every prediction the app showed
would be biased low, consistently, invisibly, and in the direction that makes a
meal look safer than it is.
"""
import sys
from pathlib import Path

import numpy as np
import pytest
import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from inference import TTA_TRANSFORMS, predict_batch, resolve_tta  # noqa: E402
from targets import TargetCodec  # noqa: E402


class Constant(nn.Module):
    """Returns a fixed output per input, keyed by which flip it received."""

    def __init__(self, by_signature):
        super().__init__()
        self.by_signature = by_signature

    def forward(self, x):
        # The corner pixel identifies which flip was applied, so the stub can
        # give a different answer per augmentation the way a real model does.
        key = float(x[0, 0, 0, 0])
        return torch.full((x.shape[0], 5), self.by_signature.get(key, 0.0))


def marked_batch():
    """One image whose four corners are distinct, so flips are detectable."""
    x = torch.zeros(1, 3, 2, 2)
    x[0, :, 0, 0] = 1.0
    x[0, :, 0, 1] = 2.0
    x[0, :, 1, 0] = 3.0
    x[0, :, 1, 1] = 4.0
    return x


def test_the_flips_are_the_flips_they_claim_to_be():
    x = marked_batch()
    assert TTA_TRANSFORMS["none"](x)[0, 0, 0, 0] == 1.0
    assert TTA_TRANSFORMS["hflip"](x)[0, 0, 0, 0] == 2.0    # left-right
    assert TTA_TRANSFORMS["vflip"](x)[0, 0, 0, 0] == 3.0    # top-bottom
    assert TTA_TRANSFORMS["hvflip"](x)[0, 0, 0, 0] == 4.0   # both


def test_averaging_happens_in_physical_units_under_a_log_target():
    # Two views disagreeing by a lot: one says the model output is 0, the other
    # 2 standardized units. In log space those decode to very different gram
    # counts, and where the average is taken decides the answer.
    codec = TargetCodec("log1p", np.zeros(5), np.ones(5))
    model = Constant({1.0: 0.0, 2.0: 2.0})

    got = predict_batch(model, marked_batch(), codec, tta=("none", "hflip")).numpy()

    physical = 0.5 * (np.expm1(0.0) + np.expm1(2.0))    # what we want
    normalized = np.expm1(0.5 * (0.0 + 2.0))            # the tempting shortcut

    assert np.allclose(got, physical)
    # And the two genuinely differ, so this test would catch the swap.
    assert not np.allclose(physical, normalized)
    assert normalized < physical                        # biased low, every time


def test_the_two_orders_coincide_for_an_identity_target():
    # Which is why the bug is invisible on the default configuration and would
    # only appear after switching target_space.
    codec = TargetCodec("identity", np.zeros(5), np.ones(5))
    model = Constant({1.0: 0.0, 2.0: 2.0})
    got = predict_batch(model, marked_batch(), codec, tta=("none", "hflip")).numpy()
    assert np.allclose(got, 1.0)


def test_a_single_augmentation_is_just_a_forward_pass():
    codec = TargetCodec("identity", np.zeros(5), np.ones(5))
    model = Constant({1.0: 3.0})
    got = predict_batch(model, marked_batch(), codec, tta=("none",)).numpy()
    assert np.allclose(got, 3.0)


def test_predictions_stay_non_negative_through_averaging():
    codec = TargetCodec("identity", np.zeros(5), np.ones(5))
    model = Constant({1.0: -5.0, 2.0: -5.0})
    got = predict_batch(model, marked_batch(), codec, tta=("none", "hflip")).numpy()
    assert (got >= 0).all()


def test_an_unknown_augmentation_is_refused_before_the_run_starts():
    # Better to fail on the command line than an hour into an evaluation.
    assert resolve_tta(["none", "hflip"]) == ["none", "hflip"]
    assert resolve_tta(None) == ["none"]
    with pytest.raises(SystemExit, match="unknown tta"):
        resolve_tta(["rotate90"])
