#!/usr/bin/env bash
set -euo pipefail

# Install blackpearl to ~/.local/bin
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/pirate-608/ai-group-work/main/scripts/install.sh | bash
#
# Or with a specific release:
#   BLACKPEARL_VERSION=v0.2.0 bash install.sh

REPO="${BLACKPEARL_REPO:-pirate-608/ai-group-work}"
INSTALL_DIR="${BLACKPEARL_INSTALL_DIR:-$HOME/.local/bin}"

get_platform() {
    local os arch
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    case "$os" in
        linux)
            if [ "$arch" = "x86_64" ]; then
                echo "linux-x64"
            else
                echo "Unsupported architecture on Linux: $arch" >&2
                exit 1
            fi
            ;;
        darwin)
            if [ "$arch" = "arm64" ]; then
                echo "macos-arm64"
            elif [ "$arch" = "x86_64" ]; then
                # If no x64 build is available, arm64 binary may run via Rosetta 2
                echo "macos-arm64"
            else
                echo "Unsupported architecture on macOS: $arch" >&2
                exit 1
            fi
            ;;
        *)
            echo "Unsupported OS: $os" >&2
            exit 1
            ;;
    esac
}

get_download_url() {
    local platform="$1"
    local version="${BLACKPEARL_VERSION:-latest}"
    local asset="blackpearl-${platform}.tar.gz"

    if [ "$version" = "latest" ]; then
        local api_url="https://api.github.com/repos/${REPO}/releases/latest"
        curl -sL "$api_url" | grep -o "https://github.com/${REPO}/releases/download/[^\"]*/${asset}" | head -n 1
    else
        echo "https://github.com/${REPO}/releases/download/${version}/${asset}"
    fi
}

main() {
    echo "Installing blackpearl ..."

    local platform
    platform=$(get_platform)
    echo "Detected platform: $platform"

    local download_url
    download_url=$(get_download_url "$platform")
    if [ -z "$download_url" ]; then
        echo "Could not find release asset for platform: $platform" >&2
        exit 1
    fi

    mkdir -p "$INSTALL_DIR"

    local tmp_dir
    tmp_dir=$(mktemp -d)
    # shellcheck disable=SC2064
    trap "rm -rf '$tmp_dir'" EXIT

    echo "Downloading from $download_url ..."
    curl -fsSL "$download_url" | tar xzf - -C "$tmp_dir"

    local source_binary="$tmp_dir/blackpearl"
    if [ ! -f "$source_binary" ]; then
        echo "Archive did not contain 'blackpearl' binary." >&2
        exit 1
    fi

    mv "$source_binary" "$INSTALL_DIR/blackpearl"
    chmod +x "$INSTALL_DIR/blackpearl"

    echo "blackpearl installed to $INSTALL_DIR/blackpearl"

    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        echo "Warning: $INSTALL_DIR is not in your PATH."
        echo "Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
        echo '  export PATH="$HOME/.local/bin:$PATH"'
    fi

    echo ""
    echo "Run 'blackpearl --help' to get started."
}

main "$@"
