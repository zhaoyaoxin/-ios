//
//  ipstackdetect.h
//
//
//

#ifndef ipstackdetect_h
#define ipstackdetect_h

#include <stdio.h>
#include "gateway.h"

typedef enum {
    ELocalIPStack_None = 0,
    ELocalIPStack_IPv4 = 1,
    ELocalIPStack_IPv6 = 2,
    ELocalIPStack_Dual = 3,
}TLocalIPStack;

/*
 ** This puts different kinds of IP addresses in one place.
 ** Here we can put IPv4 and IPv6 addresses.
 */
typedef union sockaddr_union {
    struct sockaddr sa;
    struct sockaddr_in in;
    struct sockaddr_in6 in6;
} SOCKADDR_UNION;

TLocalIPStack local_ipstack_detect(void);

#endif /* ipstackdetect_h */
