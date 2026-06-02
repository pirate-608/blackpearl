#!/usr/bin/env bash
set -euo pipefail

# Install blackpearl to ~/.local/bin
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/pirate-608/blackpearl/main/scripts/install.sh | bash
#
# Or with a specific release:
#   BLACKPEARL_VERSION=v0.2.0 bash install.sh

REPO="${BLACKPEARL_REPO:-pirate-608/blackpearl}"
INSTALL_DIR="${BLACKPEARL_INSTALL_DIR:-$HOME/.local/bin}"

# ---------- helpers ----------

ensure_install_dir() {
    if [ ! -d "$INSTALL_DIR" ]; then
        mkdir -p "$INSTALL_DIR"
        echo "Created directory: $INSTALL_DIR"
    fi
}

detect_shell_profile() {
    local shell_name
    shell_name=$(basename "${SHELL:-bash}")

    case "$shell_name" in
        zsh)
            if [ -f "$HOME/.zshrc" ]; then
                echo "$HOME/.zshrc"
            else
                echo "$HOME/.profile"
            fi
            ;;
        bash)
            if [ -f "$HOME/.bashrc" ]; then
                echo "$HOME/.bashrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                echo "$HOME/.bash_profile"
            else
                echo "$HOME/.profile"
            fi
            ;;
        *)
            echo "$HOME/.profile"
            ;;
    esac
}

ensure_path() {
    local profile
    profile=$(detect_shell_profile)
    local path_line='export PATH="$HOME/.local/bin:$PATH"'

    if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
        return 0
    fi

    # Write to shell profile if not already there
    if [ -f "$profile" ] && grep -qF "$path_line" "$profile" 2>/dev/null; then
        :
    else
        {
            echo ""
            echo "# Added by blackpearl installer"
            echo "$path_line"
        } >> "$profile"
        echo "Added PATH entry to $profile"
    fi

    # Make it available in the current shell session too
    export PATH="$HOME/.local/bin:$PATH"
}

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

# ---------- main ----------

main() {
    echo "Installing blackpearl ..."

    ensure_install_dir

    local platform
    platform=$(get_platform)
    echo "Detected platform: $platform"

    local download_url
    download_url=$(get_download_url "$platform")
    if [ -z "$download_url" ]; then
        echo "Could not find release asset for platform: $platform" >&2
        exit 1
    fi

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

    ensure_path

    echo ""
    echo "Run 'blackpearl --help' to get started."
}

main "$@"
