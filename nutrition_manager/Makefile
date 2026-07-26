# The nutrition model's common operations, in one place.
#
#     make test        the unit tests (fast, no GPU, no dataset)
#     make eval        score checkpoints/best.pt on the official test split
#     make compare     score every checkpoint and rank them
#     make export      -> export/*.onnx for the browser, verified and measured
#     make summary     the ablation table
#     make data        rebuild labels.csv and the multi-view manifest
#     make clean
#
# `test` deliberately needs neither the dataset nor a GPU: the things worth
# testing here are the target transform, the metric and the export, and all
# three are pure arithmetic that a laptop can check in two seconds.

PYTHON ?= python
CKPT   ?= checkpoints/best.pt

.PHONY: test eval compare export summary promote promote-install data clean

test:
	@$(PYTHON) -m pytest tests -q

eval:
	@$(PYTHON) eval.py --checkpoint $(CKPT)

compare:
	@$(PYTHON) eval.py --compare checkpoints/*.pt

export:
	@$(PYTHON) export_onnx.py --checkpoint $(CKPT) --quantize --score

summary:
	@$(PYTHON) runs/summarize.py

# Which model should the app ship, and install it. Ranks by the mean of both
# camera views rather than the benchmark, because the benchmark rewards a model
# that is worse at the job — see promote.py.
promote:
	@$(PYTHON) promote.py

promote-install:
	@$(PYTHON) promote.py --install

# Only needed once, and only if nutrition5k_dataset/ is present.
data:
	@$(PYTHON) data/build_labels.py
	@$(PYTHON) build_dataset.py

clean:
	@rm -rf __pycache__ */__pycache__ .pytest_cache
