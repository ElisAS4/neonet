#!/bin/bash

# NeoNet Scalable Architecture Startup Script
# Automated initialization and configuration for the enhanced NeoNet system

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/neonet/server"
CLIENT_DIR="$PROJECT_ROOT/neonet/clients/web"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/pids"

# Default configuration
SERVER_PORT=8080
CLIENT_PORT=3000
ENVIRONMENT="development"
VERBOSE=false
DAEMON_MODE=false
HEALTH_CHECK=true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# Help function
show_help() {
    cat << EOF
NeoNet Scalable Architecture Startup Script

Usage: $0 [OPTIONS] [COMMAND]

Commands:
    start       Start all NeoNet services (default)
    stop        Stop all NeoNet services
    restart     Restart all NeoNet services
    status      Show status of all services
    logs        Show logs from all services
    health      Run health checks
    clean       Clean up logs and temporary files

Options:
    -p, --server-port PORT    Server port (default: 8080)
    -c, --client-port PORT    Client port (default: 3000)
    -e, --environment ENV     Environment (development/production, default: development)
    -d, --daemon              Run in daemon mode
    -v, --verbose             Verbose output
    -h, --help                Show this help message
    --no-health-check         Skip health checks

Examples:
    $0 start                  Start with default settings
    $0 start -p 9000 -c 4000  Start with custom ports
    $0 start -d               Start in daemon mode
    $0 stop                   Stop all services
    $0 status                 Check service status

EOF
}

# Parse command line arguments
parse_args() {
    COMMAND="start"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            start|stop|restart|status|logs|health|clean)
                COMMAND="$1"
                shift
                ;;
            -p|--server-port)
                SERVER_PORT="$2"
                shift 2
                ;;
            -c|--client-port)
                CLIENT_PORT="$2"
                shift 2
                ;;
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -d|--daemon)
                DAEMON_MODE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --no-health-check)
                HEALTH_CHECK=false
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Setup directories
setup_directories() {
    log_debug "Setting up directories..."
    
    mkdir -p "$LOG_DIR"
    mkdir -p "$PID_DIR"
    
    # Create log files if they don't exist
    touch "$LOG_DIR/server.log"
    touch "$LOG_DIR/client.log"
    touch "$LOG_DIR/startup.log"
    
    log_debug "Directories created: $LOG_DIR, $PID_DIR"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check project structure
    if [ ! -d "$SERVER_DIR" ]; then
        log_error "Server directory not found: $SERVER_DIR"
        exit 1
    fi
    
    if [ ! -d "$CLIENT_DIR" ]; then
        log_error "Client directory not found: $CLIENT_DIR"
        exit 1
    fi
    
    # Check server file
    if [ ! -f "$SERVER_DIR/websocketSignalingServer_enhanced.js" ]; then
        log_error "Enhanced server file not found"
        exit 1
    fi
    
    # Check client package.json
    if [ ! -f "$CLIENT_DIR/package.json" ]; then
        log_error "Client package.json not found"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Install server dependencies
    log_debug "Installing server dependencies..."
    cd "$SERVER_DIR"
    if [ -f "package.json" ]; then
        npm install --silent >> "$LOG_DIR/startup.log" 2>&1
    fi
    
    # Install client dependencies
    log_debug "Installing client dependencies..."
    cd "$CLIENT_DIR"
    npm install --silent >> "$LOG_DIR/startup.log" 2>&1
    
    log_info "Dependencies installed"
}

# Build client application
build_client() {
    log_info "Building client application..."
    
    cd "$CLIENT_DIR"
    npm run build >> "$LOG_DIR/startup.log" 2>&1
    
    if [ $? -eq 0 ]; then
        log_info "Client build completed successfully"
    else
        log_error "Client build failed"
        exit 1
    fi
}

# Start server
start_server() {
    log_info "Starting NeoNet Enhanced Signaling Server on port $SERVER_PORT..."
    
    cd "$SERVER_DIR"
    
    if [ "$DAEMON_MODE" = true ]; then
        # Start in daemon mode
        nohup node websocketSignalingServer_enhanced.js > "$LOG_DIR/server.log" 2>&1 &
        SERVER_PID=$!
        echo $SERVER_PID > "$PID_DIR/server.pid"
        log_info "Server started in daemon mode (PID: $SERVER_PID)"
    else
        # Start in foreground
        node websocketSignalingServer_enhanced.js &
        SERVER_PID=$!
        echo $SERVER_PID > "$PID_DIR/server.pid"
        log_info "Server started (PID: $SERVER_PID)"
    fi
    
    # Wait a moment for server to start
    sleep 3
    
    # Check if server is running
    if kill -0 $SERVER_PID 2>/dev/null; then
        log_info "Server is running successfully"
    else
        log_error "Server failed to start"
        exit 1
    fi
}

# Start client
start_client() {
    log_info "Starting NeoNet Client Server on port $CLIENT_PORT..."
    
    cd "$CLIENT_DIR"
    
    if [ "$DAEMON_MODE" = true ]; then
        # Start in daemon mode
        nohup npm start > "$LOG_DIR/client.log" 2>&1 &
        CLIENT_PID=$!
        echo $CLIENT_PID > "$PID_DIR/client.pid"
        log_info "Client started in daemon mode (PID: $CLIENT_PID)"
    else
        # Start in foreground
        npm start &
        CLIENT_PID=$!
        echo $CLIENT_PID > "$PID_DIR/client.pid"
        log_info "Client started (PID: $CLIENT_PID)"
    fi
    
    # Wait for client to start
    sleep 5
    
    # Check if client is running
    if kill -0 $CLIENT_PID 2>/dev/null; then
        log_info "Client is running successfully"
    else
        log_warn "Client may have failed to start (check logs)"
    fi
}

# Stop services
stop_services() {
    log_info "Stopping NeoNet services..."
    
    # Stop server
    if [ -f "$PID_DIR/server.pid" ]; then
        SERVER_PID=$(cat "$PID_DIR/server.pid")
        if kill -0 $SERVER_PID 2>/dev/null; then
            log_info "Stopping server (PID: $SERVER_PID)..."
            kill $SERVER_PID
            sleep 2
            
            # Force kill if still running
            if kill -0 $SERVER_PID 2>/dev/null; then
                log_warn "Force killing server..."
                kill -9 $SERVER_PID
            fi
        fi
        rm -f "$PID_DIR/server.pid"
    fi
    
    # Stop client
    if [ -f "$PID_DIR/client.pid" ]; then
        CLIENT_PID=$(cat "$PID_DIR/client.pid")
        if kill -0 $CLIENT_PID 2>/dev/null; then
            log_info "Stopping client (PID: $CLIENT_PID)..."
            kill $CLIENT_PID
            sleep 2
            
            # Force kill if still running
            if kill -0 $CLIENT_PID 2>/dev/null; then
                log_warn "Force killing client..."
                kill -9 $CLIENT_PID
            fi
        fi
        rm -f "$PID_DIR/client.pid"
    fi
    
    # Kill any remaining processes
    pkill -f "websocketSignalingServer_enhanced.js" 2>/dev/null || true
    pkill -f "serve.*dist" 2>/dev/null || true
    
    log_info "Services stopped"
}

# Check service status
check_status() {
    log_info "Checking service status..."
    
    # Check server
    if [ -f "$PID_DIR/server.pid" ]; then
        SERVER_PID=$(cat "$PID_DIR/server.pid")
        if kill -0 $SERVER_PID 2>/dev/null; then
            log_info "Server is running (PID: $SERVER_PID)"
            
            # Check if port is listening
            if netstat -tlnp 2>/dev/null | grep -q ":$SERVER_PORT.*LISTEN"; then
                log_info "Server is listening on port $SERVER_PORT"
            else
                log_warn "Server process running but not listening on port $SERVER_PORT"
            fi
        else
            log_warn "Server PID file exists but process is not running"
            rm -f "$PID_DIR/server.pid"
        fi
    else
        log_warn "Server is not running"
    fi
    
    # Check client
    if [ -f "$PID_DIR/client.pid" ]; then
        CLIENT_PID=$(cat "$PID_DIR/client.pid")
        if kill -0 $CLIENT_PID 2>/dev/null; then
            log_info "Client is running (PID: $CLIENT_PID)"
            
            # Check if port is listening
            if netstat -tlnp 2>/dev/null | grep -q ":$CLIENT_PORT.*LISTEN"; then
                log_info "Client is listening on port $CLIENT_PORT"
            else
                log_warn "Client process running but not listening on port $CLIENT_PORT"
            fi
        else
            log_warn "Client PID file exists but process is not running"
            rm -f "$PID_DIR/client.pid"
        fi
    else
        log_warn "Client is not running"
    fi
}

# Run health checks
run_health_checks() {
    log_info "Running health checks..."
    
    # Check server health endpoint
    if command -v curl &> /dev/null; then
        log_debug "Checking server health endpoint..."
        if curl -s "http://localhost:$SERVER_PORT/health" > /dev/null; then
            log_info "Server health check passed"
        else
            log_warn "Server health check failed"
        fi
        
        # Check server metrics endpoint
        log_debug "Checking server metrics endpoint..."
        if curl -s "http://localhost:$SERVER_PORT/metrics" > /dev/null; then
            log_info "Server metrics endpoint accessible"
        else
            log_warn "Server metrics endpoint not accessible"
        fi
    else
        log_warn "curl not available, skipping HTTP health checks"
    fi
    
    # Check WebSocket connection
    if command -v node &> /dev/null; then
        log_debug "Testing WebSocket connection..."
        node -e "
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://localhost:$SERVER_PORT');
            ws.on('open', () => {
                console.log('[INFO] WebSocket connection test passed');
                ws.close();
                process.exit(0);
            });
            ws.on('error', (error) => {
                console.log('[WARN] WebSocket connection test failed:', error.message);
                process.exit(1);
            });
            setTimeout(() => {
                console.log('[WARN] WebSocket connection test timeout');
                process.exit(1);
            }, 5000);
        " 2>/dev/null || log_warn "WebSocket connection test failed"
    fi
}

# Show logs
show_logs() {
    log_info "Showing recent logs..."
    
    if [ -f "$LOG_DIR/server.log" ]; then
        echo -e "\n${BLUE}=== Server Logs ===${NC}"
        tail -20 "$LOG_DIR/server.log"
    fi
    
    if [ -f "$LOG_DIR/client.log" ]; then
        echo -e "\n${BLUE}=== Client Logs ===${NC}"
        tail -20 "$LOG_DIR/client.log"
    fi
    
    if [ -f "$LOG_DIR/startup.log" ]; then
        echo -e "\n${BLUE}=== Startup Logs ===${NC}"
        tail -20 "$LOG_DIR/startup.log"
    fi
}

# Clean up
clean_up() {
    log_info "Cleaning up logs and temporary files..."
    
    # Stop services first
    stop_services
    
    # Clean logs
    rm -f "$LOG_DIR"/*.log
    rm -f "$PID_DIR"/*.pid
    
    # Clean client build artifacts
    if [ -d "$CLIENT_DIR/dist" ]; then
        rm -rf "$CLIENT_DIR/dist"
    fi
    
    # Clean node_modules if requested
    read -p "Do you want to clean node_modules? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning node_modules..."
        rm -rf "$SERVER_DIR/node_modules"
        rm -rf "$CLIENT_DIR/node_modules"
    fi
    
    log_info "Cleanup completed"
}

# Main execution
main() {
    parse_args "$@"
    
    log_info "NeoNet Scalable Architecture Manager"
    log_info "Command: $COMMAND"
    log_info "Environment: $ENVIRONMENT"
    log_info "Server Port: $SERVER_PORT"
    log_info "Client Port: $CLIENT_PORT"
    
    case $COMMAND in
        start)
            setup_directories
            check_prerequisites
            install_dependencies
            build_client
            start_server
            start_client
            
            if [ "$HEALTH_CHECK" = true ]; then
                sleep 5  # Wait for services to fully start
                run_health_checks
            fi
            
            log_info "NeoNet services started successfully!"
            log_info "Server Dashboard: http://localhost:$SERVER_PORT/dashboard"
            log_info "Client Application: http://localhost:$CLIENT_PORT"
            
            if [ "$DAEMON_MODE" = false ]; then
                log_info "Press Ctrl+C to stop services"
                
                # Wait for interrupt
                trap 'stop_services; exit 0' INT TERM
                wait
            fi
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            sleep 2
            main start "$@"
            ;;
        status)
            check_status
            ;;
        logs)
            show_logs
            ;;
        health)
            run_health_checks
            ;;
        clean)
            clean_up
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"

