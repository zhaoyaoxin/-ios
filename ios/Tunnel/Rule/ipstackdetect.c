//
//  ipstackdetect.c
//
//
#include <unistd.h>
#include <netdb.h>
#include <string.h>
#include <resolv.h>
#include "ipstackdetect.h"

static int _test_connect(int pf, struct sockaddr *addr, socklen_t addrlen) {
    int s = socket(pf, SOCK_DGRAM, IPPROTO_UDP);
    if (s < 0)
        return 0;
    int ret = connect(s, addr, addrlen);
    int success = (ret == 0);
    ret = close(s);
    return success;
}

static int _have_ipv6(void) {
    static const struct sockaddr_in6 sin6_test = {
        .sin6_len = sizeof(struct sockaddr_in6),
        .sin6_family = AF_INET6,
        .sin6_port = htons(0xFFFF),
        .sin6_addr.s6_addr = {
            0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
    };
    union sockaddr_union addr = { .in6 = sin6_test };
    return _test_connect(PF_INET6, &addr.sa, sizeof(addr.in6));
}

static int _have_ipv4(void) {
    static const struct sockaddr_in sin_test = {
        .sin_len = sizeof(struct sockaddr_in),
        .sin_family = AF_INET,
        .sin_port = htons(0xFFFF),
        .sin_addr.s_addr = htonl(0x08080808L),  // 8.8.8.8
    };
    union sockaddr_union addr = { .in = sin_test };
    return _test_connect(PF_INET, &addr.sa, sizeof(addr.in));
}

static res_state getdnssvr(void)
{
    // dont forget to link libresolv.lib
    res_state res = malloc(sizeof(struct __res_state));
    
    int result = res_ninit(res);
    
    if ( result == 0 ) {
        return res;
    } else {
        printf("res_init result != 0");
    }
    
    return NULL;
}

TLocalIPStack local_ipstack_detect(void) {
//    struct in6_addr addr6_gateway = {0};
//    if (0 != getdefaultgateway6(&addr6_gateway)){ return ELocalIPStack_IPv4;}
//    if (IN6_IS_ADDR_UNSPECIFIED(&addr6_gateway)) { return ELocalIPStack_IPv4;}
//    
//    struct in_addr addr_gateway = {0};
//    if (0 != getdefaultgateway(&addr_gateway)) { return ELocalIPStack_IPv6;}
//    if (INADDR_NONE == addr_gateway.s_addr || INADDR_ANY == addr_gateway.s_addr ) { return ELocalIPStack_IPv6;}
    
    int have_ipv4 = _have_ipv4();
    int have_ipv6 = _have_ipv6();
    int local_stack = 0;
    if (have_ipv4) { local_stack |= ELocalIPStack_IPv4; }
    if (have_ipv6) { local_stack |= ELocalIPStack_IPv6; }
    if (ELocalIPStack_Dual != local_stack) { return (TLocalIPStack)local_stack; }
    
    int dns_ip_stack = ELocalIPStack_None;
    res_state dnssvr = getdnssvr();
    
    for (int i = 0; i < dnssvr->nscount; ++i) {
        if (AF_INET == dnssvr->nsaddr_list[i].sin_family) { dns_ip_stack |= ELocalIPStack_IPv4; }
        if (AF_INET6 == dnssvr->nsaddr_list[i].sin_family) { dns_ip_stack |= ELocalIPStack_IPv6; }
    }
    
    return (TLocalIPStack)(ELocalIPStack_None==dns_ip_stack? local_stack:dns_ip_stack);
}
