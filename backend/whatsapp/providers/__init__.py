"""WhatsApp provider implementations.

``base`` defines the provider interface; ``cloud`` is the real
WhatsApp Business (Cloud) API implementation and is the ONLY module in the
codebase that knows Meta endpoints, tokens or template details.
``development`` is a clearly separated mock used locally and in tests.
"""
