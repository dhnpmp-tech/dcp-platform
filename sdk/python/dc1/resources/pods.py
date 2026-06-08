"""Pods resource — interactive GPU pods (SSH, best-effort Jupyter).

A pod is a renter-launched GPU container (``job_type='interactive_pod'``)
backed by a single provider. The renter gets a blank GPU box reachable over
SSH and runs anything inside it.

The renter picks the image via the ``image`` field. Friendly aliases
(``pytorch``, ``vllm``, ``cuda``, ``ubuntu``) map to pre-baked
``dcp-compute:<alias>`` images that ship an SSH daemon for fast starts; any
other valid Docker image reference (e.g. ``ghcr.io/org/repo:tag``) is allowed
as an arbitrary image, with the daemon injecting an SSH daemon at boot.
``pytorch`` is the default when no image is given, and is the only image that
ships Jupyter (surfaced via ``access_url``).
"""
from __future__ import annotations
from typing import Optional

from ..exceptions import APIError

DEFAULT_POD_IMAGE = 'pytorch'


class PodsResource:
    def __init__(self, http):
        self._http = http

    def create(
        self,
        *,
        provider_id: Optional[int] = None,
        duration_minutes: int,
        notebook_token: str,
        image: Optional[str] = None,
    ) -> dict:
        """Launch an interactive GPU pod (SSH; Jupyter on the pytorch image).

        Args:
            provider_id: ID of the provider to pin the pod to. If omitted, the
                backend auto-picks a capable, online provider.
            duration_minutes: Maximum runtime in minutes. Billing is based on
                actual usage.
            notebook_token: Strong token used to authenticate against the
                pod's Jupyter server (pytorch image only). The backend rejects
                weak tokens.
            image: Image to boot. A friendly alias (``pytorch``, ``vllm``,
                ``cuda``, ``ubuntu``) maps to a pre-baked ``dcp-compute``
                image, or any valid Docker image reference (e.g.
                ``ghcr.io/org/repo:tag``) for an arbitrary image. If omitted,
                the backend defaults to ``pytorch``.

        Returns:
            Dict with ``id`` (the pod/job id) and initial ``status``
            (``'starting'``). The pod boots asynchronously; poll ``get()``
            until ``status == 'running'`` to obtain ``access_url`` and
            ``ssh_command``.
        """
        body: dict = {
            'duration_minutes': duration_minutes,
            'params': {'NOTEBOOK_TOKEN': notebook_token},
        }
        if provider_id is not None:
            body['provider_id'] = provider_id
        if image:
            body['image'] = image

        data = self._http.post('/api/pods', body)
        pod_id = str(data.get('id', data.get('job_id', '')))
        if not pod_id:
            raise APIError(
                'Pod creation succeeded but no id was returned',
                status_code=500,
                response=data,
            )
        return {
            'id': pod_id,
            'status': data.get('status', 'starting'),
            'access_url': data.get('access_url'),
            'ssh_command': data.get('ssh_command'),
            'root_password': data.get('root_password'),
            'jupyter_token': data.get('jupyter_token'),
        }

    def get(self, pod_id: str) -> dict:
        """Fetch current status and connection details of a pod.

        Args:
            pod_id: The pod id returned by create().

        Returns:
            Dict with ``id``, ``status``, ``access_url``, ``ssh_command``, and
            ``root_password``. ``access_url`` and ``ssh_command`` are populated
            once the pod reaches ``status == 'running'``.
        """
        data = self._http.get(f'/api/pods/{pod_id}')
        return {
            'id': str(data.get('id', pod_id)),
            'status': data.get('status', 'unknown'),
            'access_url': data.get('access_url'),
            'ssh_command': data.get('ssh_command'),
            'root_password': data.get('root_password'),
        }

    def list(self, limit: int = 20) -> list[dict]:
        """List recent pods for the authenticated renter.

        Args:
            limit: Maximum number of pods to return (default 20).

        Returns:
            List of pod dicts, newest first.
        """
        data = self._http.get('/api/pods', params={'limit': limit})
        pods_raw = data if isinstance(data, list) else data.get('pods', [])
        return [
            {
                'id': str(p.get('id', p.get('job_id', ''))),
                'status': p.get('status', 'unknown'),
                'access_url': p.get('access_url'),
                'ssh_command': p.get('ssh_command'),
            }
            for p in pods_raw
        ]

    def stop(self, pod_id: str) -> dict:
        """Stop a running pod and tear down its relay.

        Args:
            pod_id: The pod id to stop.

        Returns:
            Dict with ``success`` boolean and ``id``.
        """
        data = self._http.delete(f'/api/pods/{pod_id}')
        return {
            'success': bool(data.get('success', True)),
            'id': str(data.get('id', pod_id)),
        }
