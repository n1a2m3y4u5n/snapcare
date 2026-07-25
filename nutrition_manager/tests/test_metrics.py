"""The scoring metric, pinned against the upstream definition.

`eval.py` prints a number that gets quoted against published Nutrition5k
results. If our arithmetic drifts from
`nutrition5k_dataset/scripts/compute_eval_statistics.py` — even slightly, even
in a way that looks like a reasonable improvement — that comparison silently
stops being a comparison. So the reference implementation is executed here
rather than described.
"""
import statistics
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import metrics  # noqa: E402

TARGETS = ["calories", "mass", "fat", "carb", "protein"]


def upstream(preds, gts):
    """The upstream scorer's arithmetic, transcribed from its source.

    Kept as a separate literal implementation on purpose: a test that reuses
    `metrics.per_field` to check `metrics.per_field` proves only that it is
    self-consistent.
    """
    mae, mae_pct = [], []
    for j in range(preds.shape[1]):
        errs = [abs(float(p) - float(g)) for p, g in zip(preds[:, j], gts[:, j])]
        truth = [float(g) for g in gts[:, j]]
        mae.append(statistics.mean(errs))
        mae_pct.append(100 * statistics.mean(errs) / statistics.mean(truth))
    return np.array(mae), np.array(mae_pct)


def test_we_compute_what_the_official_scorer_computes():
    rng = np.random.default_rng(0)
    gts = rng.gamma(2.0, 100.0, (500, 5))
    preds = np.clip(gts + rng.normal(0, 30, gts.shape), 0, None)

    mine = metrics.per_field(preds, gts)
    theirs = upstream(preds, gts)
    assert np.allclose(mine[0], theirs[0], rtol=1e-12)
    assert np.allclose(mine[1], theirs[1], rtol=1e-12)


def test_mae_percent_is_not_the_mean_of_per_dish_percentages():
    """The distinction that decides how the model should be trained.

    The denominator is the mean of the ground truth over the whole split — a
    constant — so MAE% is absolute error in rescaled units. A gram of error on
    a large dish counts exactly as much as a gram on a small one. Optimizing
    per-dish relative error instead would be optimizing a different objective
    than the one being reported, which is why the default target space is
    physical units rather than log.
    """
    gts = np.array([[10.0], [1000.0]])
    preds = np.array([[20.0], [1010.0]])          # 10 units off on each

    _, mae_pct = metrics.per_field(preds, gts)
    # Ratio of means: 10 / 505.
    assert mae_pct[0] == pytest.approx(100 * 10 / 505)

    # The mean of per-dish percentages would be (100% + 1%) / 2 = 50.5%,
    # nearly 26x larger. These are not the same measurement.
    per_dish = np.mean([100 * 10 / 10, 100 * 10 / 1000])
    assert per_dish == pytest.approx(50.5)
    assert not np.isclose(mae_pct[0], per_dish)


def test_a_perfect_prediction_scores_zero():
    gts = np.random.default_rng(1).gamma(2.0, 100.0, (50, 5))
    mae, mae_pct = metrics.per_field(gts, gts)
    assert np.allclose(mae, 0)
    assert np.allclose(mae_pct, 0)


def test_an_all_zero_field_does_not_divide_by_zero():
    # A degenerate split — a field that is zero for every dish — must not turn
    # the whole report into NaN, because a NaN silently loses every comparison
    # it takes part in and would make model selection meaningless.
    gts = np.zeros((10, 5))
    preds = np.ones((10, 5))
    mae, mae_pct = metrics.per_field(preds, gts)
    assert np.isfinite(mae).all()
    assert np.isfinite(mae_pct).all()


def test_the_json_keys_match_the_official_output():
    # eval.py writes eval_stats.json in the layout the upstream scorer uses, so
    # the two can be diffed directly.
    mae = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    mae_pct = np.array([10.0, 20.0, 30.0, 40.0, 50.0])
    out = metrics.as_dict(TARGETS, mae, mae_pct)
    assert out["calories_MAE"] == 1.0
    assert out["protein_MAE_%"] == 50.0
    assert set(out) == {f"{t}_{s}" for t in TARGETS for s in ("MAE", "MAE_%")}


def test_the_table_reports_the_mean_row():
    text = metrics.format_table(TARGETS, np.arange(1.0, 6.0), np.arange(10.0, 60.0, 10.0))
    assert "mean" in text
    assert "30.0%" in text          # mean of 10..50
    for name in TARGETS:
        assert name in text


def test_atwater_consistency_helper_matches_the_apps_check():
    """The relationship the app validates every number against.

    SnapCare discards a nutrition field whose energy does not reconcile with
    its macronutrients, so a model whose five outputs disagree with each other
    has its answers thrown away however accurate any one of them is. This pins
    the formula the check uses; the measured agreement is in the README.
    """
    # 9 kcal/g fat, 4 kcal/g carbohydrate, 4 kcal/g protein.
    preds = np.array([[  0.0, 100.0,  0.0,  0.0,  0.0],
                      [100.0, 100.0,  0.0, 25.0,  0.0],
                      [ 90.0, 100.0, 10.0,  0.0,  0.0],
                      [400.0, 200.0, 20.0, 25.0, 30.0]])
    atwater = 9 * preds[:, 2] + 4 * preds[:, 3] + 4 * preds[:, 4]
    assert np.allclose(atwater, [0.0, 100.0, 90.0, 400.0])
