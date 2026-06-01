# Provider Installer Build Notes

The provider setup entry points live in [backend/installers/](../backend/installers/).

Current maintained scripts:

| Platform | Script |
| --- | --- |
| Windows | `backend/installers/dcp-setup-windows.ps1` |
| Linux/macOS | `backend/installers/dcp-setup-unix.sh` |
| Debian package | `backend/installers/build-deb.sh` |
| macOS package | `backend/installers/build-mac-pkg.sh` |

Generated binaries and package staging folders are release artifacts. Do not commit `.deb`, `.exe`, `.msi`, `.pkg`, or generated installer staging directories to this repository.

For local validation, run the installer script in a disposable VM or provider test machine before publishing a release artifact.
