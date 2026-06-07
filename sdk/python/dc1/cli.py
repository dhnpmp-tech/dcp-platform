"""Command-line interface for the DC1 SDK — ``dcp pod create|list|stop``.

Reads the renter API key from ``--api-key`` or the ``DCP_API_KEY`` /
``DC1_RENTER_KEY`` environment variables.

Examples::

    dcp pod create --provider 42 --duration 60 --token s3cr3t-notebook-token
    dcp pod list
    dcp pod get <pod_id>
    dcp pod stop <pod_id>
"""
from __future__ import annotations
import argparse
import os
import sys

from .client import DC1Client, DEFAULT_BASE_URL
from .exceptions import DC1Error

API_KEY_ENV_VARS = ('DCP_API_KEY', 'DC1_RENTER_KEY')


def _resolve_api_key(arg_key: str | None) -> str | None:
    if arg_key:
        return arg_key
    for var in API_KEY_ENV_VARS:
        value = os.environ.get(var)
        if value:
            return value
    return None


def _build_client(args: argparse.Namespace) -> DC1Client:
    api_key = _resolve_api_key(args.api_key)
    if not api_key:
        env_hint = ' or '.join(API_KEY_ENV_VARS)
        raise SystemExit(
            f'error: no API key. Pass --api-key or set {env_hint}.'
        )
    return DC1Client(api_key=api_key, base_url=args.base_url)


def _cmd_create(client: DC1Client, args: argparse.Namespace) -> int:
    pod = client.pods.create(
        provider_id=args.provider,
        duration_minutes=args.duration,
        notebook_token=args.token,
        image=args.image,
    )
    pod_id = pod['id']
    root_password = pod.get('root_password')
    jupyter_token = pod.get('jupyter_token') or args.token
    print(f'Pod {pod_id} {pod.get("status", "starting")}. Booting...')

    access_url = pod.get('access_url')
    ssh_command = pod.get('ssh_command')

    if not (access_url and ssh_command) and not args.no_wait:
        access_url, ssh_command = _poll_until_ready(client, pod_id, args.timeout)

    print(f'id:          {pod_id}')
    print(f'token:       {jupyter_token}')
    if root_password:
        print(f'ssh_password: {root_password}')
    if access_url:
        print(f'access_url:  {access_url}')
    if ssh_command:
        print(f'ssh_command: {ssh_command}')
    if not (access_url and ssh_command):
        print(f'(not ready yet — run `dcp pod get {pod_id}` to check again)')
    return 0


def _poll_until_ready(client: DC1Client, pod_id: str, timeout: int):
    import time

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        pod = client.pods.get(pod_id)
        access_url = pod.get('access_url')
        ssh_command = pod.get('ssh_command')
        if access_url and ssh_command:
            return access_url, ssh_command
        if pod.get('status') in ('failed', 'cancelled', 'stopped'):
            return None, None
        time.sleep(5)
    return None, None


def _cmd_list(client: DC1Client, args: argparse.Namespace) -> int:
    pods = client.pods.list(limit=args.limit)
    if not pods:
        print('No pods.')
        return 0
    for pod in pods:
        print(f'{pod["id"]:<24} {pod["status"]:<12} {pod.get("access_url") or "-"}')
    return 0


def _cmd_get(client: DC1Client, args: argparse.Namespace) -> int:
    pod = client.pods.get(args.pod_id)
    print(f'id:          {pod["id"]}')
    print(f'status:      {pod["status"]}')
    print(f'access_url:  {pod.get("access_url") or "-"}')
    print(f'ssh_command: {pod.get("ssh_command") or "-"}')
    return 0


def _cmd_stop(client: DC1Client, args: argparse.Namespace) -> int:
    result = client.pods.stop(args.pod_id)
    if result.get('success'):
        print(f'Pod {result["id"]} stopped.')
        return 0
    print(f'Failed to stop pod {args.pod_id}.')
    return 1


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='dcp', description='DCP GPU compute marketplace CLI.')
    parser.add_argument('--api-key', default=None, help='Renter API key (or set DCP_API_KEY / DC1_RENTER_KEY).')
    parser.add_argument('--base-url', default=DEFAULT_BASE_URL, help=f'API base URL (default {DEFAULT_BASE_URL}).')

    sub = parser.add_subparsers(dest='resource', required=True)
    pod = sub.add_parser('pod', help='Manage interactive GPU pods (Jupyter + SSH).')
    pod_sub = pod.add_subparsers(dest='action', required=True)

    p_create = pod_sub.add_parser('create', help='Launch an interactive pod.')
    p_create.add_argument('--provider', type=int, default=None, help='Provider ID to pin to (auto-picked if omitted).')
    p_create.add_argument('--duration', type=int, required=True, help='Max runtime in minutes.')
    p_create.add_argument('--token', required=True, help='Strong Jupyter notebook token.')
    p_create.add_argument('--image', default='dcp-compute:pytorch', help='Container image (default dcp-compute:pytorch).')
    p_create.add_argument('--timeout', type=int, default=300, help='Seconds to wait for the pod to become ready (default 300).')
    p_create.add_argument('--no-wait', action='store_true', help='Return immediately instead of polling until ready.')
    p_create.set_defaults(func=_cmd_create)

    p_list = pod_sub.add_parser('list', help='List recent pods.')
    p_list.add_argument('--limit', type=int, default=20, help='Max pods to return (default 20).')
    p_list.set_defaults(func=_cmd_list)

    p_get = pod_sub.add_parser('get', help='Show a single pod.')
    p_get.add_argument('pod_id', help='The pod id.')
    p_get.set_defaults(func=_cmd_get)

    p_stop = pod_sub.add_parser('stop', help='Stop a running pod.')
    p_stop.add_argument('pod_id', help='The pod id.')
    p_stop.set_defaults(func=_cmd_stop)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        client = _build_client(args)
        return args.func(client, args)
    except DC1Error as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
