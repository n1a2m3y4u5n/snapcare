"""The preprocessing pipeline, which has two jobs that pull against each other.

Augmentation for this task is not the free lunch it is for classification. The
model has to judge *how much food* is on a plate, and the plate is the only
size reference in the frame — so a transform that changes how much of the plate
is visible changes the answer while leaving the label alone. These tests pin
the pieces that are easy to reorder or drop without noticing.
"""
import sys
from pathlib import Path

import pytest
import torch
from PIL import Image
from torchvision import transforms

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.dataset import IMAGENET_MEAN, IMAGENET_STD, build_transforms  # noqa: E402


def names(pipeline):
    return [type(t).__name__ for t in pipeline.transforms]


def a_photo(w=640, h=480):
    return Image.new("RGB", (w, h), (120, 90, 60))


def test_evaluation_does_nothing_random():
    """The same photograph must always score the same.

    Any randomness here would make the reported metric noisy and, worse, make
    the app give a different answer to two photographs of the same plate.
    """
    pipeline = build_transforms(224, train=False)
    assert names(pipeline) == ["Resize", "CenterCrop", "ToTensor", "Normalize"]

    img = a_photo()
    first = pipeline(img)
    for _ in range(5):
        assert torch.equal(pipeline(img), first)


def test_evaluation_resizes_then_crops_at_the_documented_ratio():
    # web/mealModel.ts and export_onnx.py both reimplement this. The 1.15 is
    # what they are told to use, so it has to stay what happens here.
    pipeline = build_transforms(224, train=False)
    resize, crop = pipeline.transforms[0], pipeline.transforms[1]
    assert resize.size == int(round(224 * 1.15))
    assert tuple(crop.size) == (224, 224)

    out = pipeline(a_photo())
    assert out.shape == (3, 224, 224)


def test_normalization_matches_what_the_exported_graph_bakes_in():
    # DeployableModel copies these constants into the ONNX graph. If they drift
    # apart, the browser feeds the network a differently-centred image and gets
    # confident, wrong grams.
    norm = build_transforms(224, train=False).transforms[-1]
    assert list(norm.mean) == IMAGENET_MEAN
    assert list(norm.std) == IMAGENET_STD


def test_training_augmentation_is_random_but_shaped_right():
    pipeline = build_transforms(224, train=True)
    out = pipeline(a_photo())
    assert out.shape == (3, 224, 224)
    # Two draws should differ — if they stop differing, augmentation is off.
    assert not torch.equal(pipeline(a_photo()), pipeline(a_photo()))


@pytest.mark.parametrize("floor", [0.5, 0.7, 0.85, 1.0])
def test_the_crop_floor_is_honoured(floor):
    # The knob that decides whether the plate rim stays in frame.
    crop = build_transforms(224, train=True, crop_scale_min=floor).transforms[0]
    assert isinstance(crop, transforms.RandomResizedCrop)
    assert crop.scale == (floor, 1.0)


def test_perspective_is_off_unless_asked_for():
    # It defaults off so the v2 numbers stay reproducible; turning it on is an
    # experiment, not the baseline.
    assert "RandomPerspective" not in names(build_transforms(224, train=True))


def test_perspective_warps_after_the_crop():
    """Order matters, and getting it wrong makes the augmentation weaker.

    RandomPerspective fills the corners it vacates. Applied before the crop,
    much of that filled area is then cropped away and the effective distortion
    is smaller than requested; applied after, the warp is what the model sees.
    """
    pipeline = build_transforms(224, train=True, perspective=0.35)
    order = names(pipeline)
    assert "RandomPerspective" in order
    assert order.index("RandomPerspective") > order.index("RandomResizedCrop")
    # ...and before the tensor conversion, since it is a PIL-space operation.
    assert order.index("RandomPerspective") < order.index("ToTensor")

    out = pipeline(a_photo())
    assert out.shape == (3, 224, 224)


def test_perspective_probability_is_passed_through():
    warp = [t for t in build_transforms(224, True, 0.7, 0.35, 0.9).transforms
            if isinstance(t, transforms.RandomPerspective)][0]
    assert warp.p == 0.9
    assert warp.distortion_scale == 0.35


def test_flips_and_rotation_are_present_because_dishes_have_no_up():
    # cafe1's side-angle rigs are mounted upside-down and sweep the plate
    # through every azimuth, and a dish's nutrition does not depend on which
    # way the camera was held. Dropping these would make the model learn an
    # orientation it has no reason to care about.
    order = names(build_transforms(224, train=True))
    assert "RandomHorizontalFlip" in order
    assert "RandomVerticalFlip" in order
    assert "RandomApply" in order       # wraps RandomRotation
