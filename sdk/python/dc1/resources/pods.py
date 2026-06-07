"""Pods resource — interactive GPU pods (Jupyter + SSH).

A pod is a long-lived interactive container (``job_type='interactive_pod'``)
backed by a single provider. The backend boots a ``dcp-compute`` image with a
Jupyter server and an SSH daemon, relays the ports out through the VPS, and
exposes an ``access_url`` (Jupyter) plus an ``ssh_command``.
"""
from __future__ import annotations
from typing import Optional

from ..exceptions import APIError

DEFAULT_POD_IMAGE = 'dcp-compute:pytorch'


class PodsResource:
    def __init__(self, http):
        self._http = http

    def create(
        self,
        *,
        provider_id: Optional[int] = None,
        duration_minutes: int,
        notebook_token: str,
        image: str = DEFAULT_POD_IMAGE,
    ) -> dict:
        """Launch an interactive GPU pod (Jupyter notebook + SSH).

        Args:
            provider_id: ID of the provider to pin the pod to. If omitted, the
                backend auto-picks a capable, online provider.
            duration_minutes: Maximum runtime in minutes. Billing is based on
                actual usage.
            notebook_token: Strong token used to authenticate against the
                pod's Jupyter server. The backend rejects weak tokens.
            image: Container image to boot (default ``dcp-compute:pytorch``).

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
        if image and image != DEFAULT_POD_IMAGE:
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
            Dict with ``id``, ``status``, ``access_url``, and ``ssh_command``.
            ``access_url`` and ``ssh_command`` are populated once the pod
            reaches ``status == 'running'``.
        """
        data = self._http.get(f'/api/pods/{pod_id}')
        return {
            'id': str(data.get('id', pod_id)),
            'status': data.get('status', 'unknown'),
            'access_url': data.get('access_url'),
            'ssh_command': data.get('ssh_command'),
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
