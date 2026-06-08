"""DC1Client — top-level entry point for the DC1 Python SDK."""
from __future__ import annotations

from .http import HttpClient
from .resources.jobs import JobsResource
from .resources.pods import PodsResource
from .resources.providers import ProvidersResource
from .resources.wallet import WalletResource

DEFAULT_BASE_URL = 'https://api.dcp.sa'


class DC1Client:
    """Official Python client for the DC1 GPU compute marketplace.

    Args:
        api_key: Your renter API key (starts with ``dc1-renter-``).
        base_url: API base URL. Defaults to ``https://api.dcp.sa``.
        timeout: HTTP request timeout in seconds (default 30).

    Example::

        import dc1

        client = dc1.DC1Client(api_key='dc1-renter-abc123')

        # Browse available GPUs
        providers = client.providers.list()
        print(providers[0].gpu_model, providers[0].vram_gb, 'GB')

        # Submit an LLM inference job
        job = client.jobs.submit(
            'llm_inference',
            {'prompt': 'Explain transformers in one paragraph.', 'model': 'llama3'},
            provider_id=providers[0].id,
            duration_minutes=2,
        )

        # Wait for result (blocks, with 5-min timeout)
        result = client.jobs.wait(job.id)
        print(result.result['output'])

        # Check wallet
        wallet = client.wallet.balance()
        print(f'Balance: {wallet.balance_sar:.2f} SAR')
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: int = 30,
    ):
        if not api_key:
            raise ValueError('api_key is required')
        self._http = HttpClient(api_key=api_key, base_url=base_url, timeout=timeout)
        self.jobs = JobsResource(self._http)
        self.pods = PodsResource(self._http)
        self.providers = ProvidersResource(self._http)
        self.wallet = WalletResource(self._http)
