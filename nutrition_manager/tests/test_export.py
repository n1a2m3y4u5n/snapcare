"""The wrapper that goes into the ONNX graph.

`DeployableModel` re-implements, in a form the exporter can trace, what
`TargetCodec.decode` and the eval transform do in Python. Two implementations
of the same arithmetic is exactly the arrangement that drifts, and drift here
does not throw — it ships a model that returns confident, wrong grams to a
browser.

So the test is always the same question: does the thing that gets exported
agree with the thing that was trained and measured?
"""
import sys
from pathlib import Path

import numpy as np
import pytest
import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.dataset import IMAGENET_MEAN, IMAGENET_STD  # noqa: E402
from export_onnx import DeployableModel  # noqa: E402
from targets import SPACES, TargetCodec, fit_stats  # noqa: E402


class Passthrough(nn.Module):
    """Stands in for the backbone: reports a fixed vector per image.

    Using a real backbone here would test timm rather than the wrapper, and
    would make a disagreement impossible to localise.
    """

    def __init__(self, values):
        super().__init__()
        self.register_buffer("values", torch.as_tensor(values, dtype=torch.float32))

    def forward(self, x):
        # Shaped (N, 5) exactly as a real regression head is — a stub that
        # broadcast to some other rank would make the wrapper look correct
        # while hiding a shape bug in the thing it wraps.
        return self.values.unsqueeze(0).expand(x.shape[0], -1)


def codec_for(space, seed=0):
    rng = np.random.default_rng(seed)
    y = np.stack([
        rng.gamma(2.0, 130.0, 300), rng.gamma(2.2, 100.0, 300),
        rng.gamma(1.4, 9.0, 300), rng.gamma(1.6, 12.0, 300),
        rng.gamma(1.5, 12.0, 300),
    ], axis=1)
    return TargetCodec(space, *fit_stats(y, space))


@pytest.mark.parametrize("space", SPACES)
def test_the_graph_decodes_exactly_as_the_codec_does(space):
    """The claim the whole export rests on.

    If these ever disagree, every number the browser shows is off by a factor
    and the training-time metrics no longer describe the deployed model.
    """
    codec = codec_for(space)
    raw = torch.tensor([[0.4, -1.2, 0.0, 2.1, -0.3],
                        [1.5, 0.2, -0.8, 0.9, 1.1]], dtype=torch.float32)

    model = DeployableModel(Passthrough(raw[0]), codec).eval()
    with torch.no_grad():
        # A uniform grey image, so the stub's output is exactly `raw[0]`.
        got = model(torch.full((1, 3, 8, 8), 0.5))

    expected = codec.decode(raw[0].double().numpy())
    assert np.allclose(got.numpy()[0], expected, rtol=1e-5, atol=1e-5), (
        f"{space}: graph gave {got.numpy()[0]}, codec gives {expected}"
    )


@pytest.mark.parametrize("space", SPACES)
def test_the_graph_never_returns_a_negative_gram(space):
    # A linear head can output anything, and a negative value would corrupt the
    # day's running total rather than look like one obviously wrong reading.
    codec = codec_for(space)
    model = DeployableModel(Passthrough([-40.0] * 5), codec).eval()
    with torch.no_grad():
        out = model(torch.full((1, 3, 8, 8), 0.5))
    assert (out.numpy() >= 0).all()


def test_imagenet_normalization_happens_inside_the_graph():
    """The constants the browser is spared from copying.

    The wrapper takes pixels in [0,1] and normalizes internally, so the only
    thing the TypeScript owes the model is geometry. This checks the graph
    actually applies the transform rather than assuming the caller did.
    """
    codec = TargetCodec("identity", np.zeros(5), np.ones(5))

    class ReportsFirstPixel(nn.Module):
        def forward(self, x):
            return x[:, :, 0, 0].repeat(1, 2)[:, :5]

    model = DeployableModel(ReportsFirstPixel(), codec).eval()
    with torch.no_grad():
        out = model(torch.full((1, 3, 4, 4), 0.5)).numpy()[0]

    expected = [(0.5 - m) / s for m, s in zip(IMAGENET_MEAN, IMAGENET_STD)]
    # Clamped at zero, so compare only the channels that stay positive.
    for got, want in zip(out[:3], expected):
        assert np.isclose(got, max(want, 0.0), atol=1e-6)


def test_a_batch_is_scored_the_same_as_the_images_alone():
    # The exported graph declares a dynamic batch axis so the app can score
    # several crops in one call. Nothing may leak between rows.
    codec = codec_for("identity")

    class PerImage(nn.Module):
        def forward(self, x):
            m = x.mean(dim=(1, 2, 3), keepdim=False)
            return torch.stack([m, m * 2, m * 3, m * 4, m * 5], dim=1)

    model = DeployableModel(PerImage(), codec).eval()
    a = torch.full((1, 3, 8, 8), 0.2)
    b = torch.full((1, 3, 8, 8), 0.8)
    with torch.no_grad():
        alone = torch.cat([model(a), model(b)])
        together = model(torch.cat([a, b]))
    assert torch.allclose(alone, together, atol=1e-6)


@pytest.mark.parametrize("space", SPACES)
def test_the_wrapper_round_trips_through_onnx(space, tmp_path):
    """End to end: export, run under onnxruntime, compare against PyTorch.

    `check_parity` does this on every real export. Doing it here on a stub
    means a broken export is caught by the test suite rather than only when
    somebody happens to export a model — and it covers the log1p branch, which
    no shipped checkpoint currently exercises.
    """
    pytest.importorskip("onnxruntime")
    from export_onnx import check_parity, export

    codec = codec_for(space)
    model = DeployableModel(Passthrough([0.3, -0.5, 1.2, 0.0, 0.7]), codec).eval()

    path = tmp_path / f"stub-{space}.onnx"
    export(model, img_size=16, out_path=path)
    assert path.is_file()

    drift = check_parity(model, path, img_size=16, n=4)
    assert drift < 1e-3, f"{space}: exported graph drifted by {drift}"
