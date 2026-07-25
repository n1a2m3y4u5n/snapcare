"""Torch Dataset + image transforms for the overhead RGB nutrition model."""
import sys
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import PROJECT  # noqa: E402

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def build_transforms(img_size: int, train: bool, crop_scale_min: float = 0.7,
                     perspective: float = 0.0, perspective_p: float = 0.5):
    """Preprocessing for one image. The augmentation arguments apply to training only.

    Two of these are not free parameters here the way they are for
    classification, because this model has to judge *how much food* is on a
    plate and the plate is the only size reference in the frame.

    `crop_scale_min` — cropping to 70% of the image can take the rim out of
    shot, or cut off part of the dish, while the label still states the mass of
    the whole thing. So an aggressive crop is not just a harder view of the same
    example, it is a wrong label. Raising the floor keeps the plate in frame at
    the cost of less augmentation.

    `perspective` — the one augmentation aimed squarely at how the app is used.
    Overhead training frames are taken from directly above; users hold a phone
    at an angle, and the model is around fifteen points worse on the side-angle
    frames that resemble that. A random perspective warp turns an overhead photo
    into a plausible off-axis one *without* changing what is on the plate, which
    is exactly the invariance that is missing. 0 disables it.

    `runs/queue.sh` measures both rather than assuming either.
    """
    if train:
        stages = [
            transforms.RandomResizedCrop(
                img_size, scale=(crop_scale_min, 1.0), ratio=(0.85, 1.18)
            ),
            # Vertical flip + wide rotation make the model orientation-robust,
            # which matters because the side-angle frames come from cafe1 videos
            # that are mounted upside-down and sweep through many azimuths.
            # Nutrition totals do not depend on orientation, so this is safe.
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomApply([transforms.RandomRotation(25)], p=0.5),
        ]
        if perspective > 0:
            # After the crop, so the warp fills the frame rather than being
            # partly cropped away again.
            stages.append(
                transforms.RandomPerspective(distortion_scale=perspective, p=perspective_p)
            )
        stages += [
            transforms.ColorJitter(0.15, 0.15, 0.15, 0.03),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
        return transforms.Compose(stages)
    resize = int(round(img_size * 1.15))
    return transforms.Compose(
        [
            transforms.Resize(resize),
            transforms.CenterCrop(img_size),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )


class Nutrition5kDataset(Dataset):
    """Yields (image_tensor, raw_target_vector, dish_id).

    Targets are returned in *raw physical units*; standardization happens in the
    training loop so the exact same checkpoint can de-normalize at eval time.
    """

    def __init__(self, df, targets, transform, path_col: str = "image_path"):
        self.df = df.reset_index(drop=True)
        self.targets = list(targets)
        self.transform = transform
        self.path_col = path_col

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = PROJECT / row[self.path_col]  # image_path is project-relative
        img = Image.open(img_path).convert("RGB")
        img = self.transform(img)
        target = torch.tensor([float(row[c]) for c in self.targets], dtype=torch.float32)
        return img, target, row["dish_id"]
