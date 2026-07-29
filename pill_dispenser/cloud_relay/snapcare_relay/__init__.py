"""SnapCare cloud relay — a mailbox the dispenser and the app both reach.

The dispenser is behind a home router, so nothing can connect *to* it. It holds
one outbound connection here instead, and a schedule edited in the web app is
waiting on the other end of it.

The relay cannot read anything it carries. See `mailbox.py`.
"""

__version__ = "1.0.0"
