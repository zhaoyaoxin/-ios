#include <stdio.h>
#include "gateway.h"
#include <targetconditionals.h>

#if TARGET_OS_OSX
#include <net/route.h>
#else
#include "route.h"
#endif


#define CTL_NET         4 /* network, see socket.h */


#if defined(BSD) || defined(__APPLE__)

#define ROUNDUP(a) \
((a) > 0 ? (1 + (((a) - 1) | (sizeof(long) - 1))) : sizeof(long))

int defaultgateway(struct in_addr * addr)
{
#if 0
    /* net.route.0.inet.dump.0.0 ? */
    int mib[] = {CTL_NET, PF_ROUTE, 0, AF_INET,
        NET_RT_DUMP, 0, 0/*tableid*/};
#endif
    /* net.route.0.inet.flags.gateway */
    int mib[] = {CTL_NET, PF_ROUTE, 0, AF_INET,
        NET_RT_FLAGS, RTF_GATEWAY};
    size_t l;
    char * buf, * p;
    struct rt_msghdr * rt;
    struct sockaddr * sa;
    struct sockaddr * sa_tab[RTAX_MAX];
    int i;
    int r = -1;
    if(sysctl(mib, sizeof(mib)/sizeof(int), 0, &l, 0, 0) < 0) {
        return -1;
    }
    if(l>0) {
        buf = malloc(l);
        if(sysctl(mib, sizeof(mib)/sizeof(int), buf, &l, 0, 0) < 0) {
            return -1;
        }
        for(p=buf; p<buf+l; p+=rt->rtm_msglen) {
            rt = (struct rt_msghdr *)p;
            sa = (struct sockaddr *)(rt + 1);
            for(i=0; i<RTAX_MAX; i++) {
                if(rt->rtm_addrs & (1 << i)) {
                    sa_tab[i] = sa;
                    sa = (struct sockaddr *)((char *)sa + sa->sa_len);
                } else {
                    sa_tab[i] = NULL;
                }
            }
            
            if( ((rt->rtm_addrs & (RTA_DST|RTA_GATEWAY)) == (RTA_DST|RTA_GATEWAY))
               && sa_tab[RTAX_DST]->sa_family == AF_INET
               && sa_tab[RTAX_GATEWAY]->sa_family == AF_INET) {
                
                unsigned char octet[4]  = {0,0,0,0};
                for (i=0; i<4; i++){
                    octet[i] = ( ((struct sockaddr_in *)(sa_tab[RTAX_GATEWAY]))->sin_addr.s_addr >> (i*8) ) & 0xFF;
                }
                
                if(((struct sockaddr_in *)sa_tab[RTAX_DST])->sin_addr.s_addr == 0) {
                    if(octet[0] == 192 && octet[1] == 168){
                        *addr = ((struct sockaddr_in *)(sa_tab[RTAX_GATEWAY]))->sin_addr;
                        r = 0;
                        printf("gateway address--%d.%d.%d.%d\n",octet[0],octet[1],octet[2],octet[3]);
                    }
                }
            }
        }
        free(buf);
    }
    return r;
}

int defaultgateway6(struct in6_addr * addr)
{
    /* net.route.0.inet.flags.gateway */
    int mib[] = {CTL_NET, PF_ROUTE, 0, AF_INET6,
        NET_RT_FLAGS, RTF_GATEWAY};
    size_t l;
    char * buf, * p;
    struct rt_msghdr * rt;
    struct sockaddr_in6 * sa;
    struct sockaddr_in6 * sa_tab[RTAX_MAX];
    int i;
    int r = -1;
    if(sysctl(mib, sizeof(mib)/sizeof(int), 0, &l, 0, 0) < 0) {
        return -1;
    }
    if(l>0) {
        buf = malloc(l);
        if(sysctl(mib, sizeof(mib)/sizeof(int), buf, &l, 0, 0) < 0) {
            return -1;
        }
        for(p=buf; p<buf+l; p+=rt->rtm_msglen) {
            rt = (struct rt_msghdr *)p;
            sa = (struct sockaddr_in6 *)(rt + 1);
            for(i=0; i<RTAX_MAX; i++) {
                if(rt->rtm_addrs & (1 << i)) {
                    sa_tab[i] = sa;
                    sa = (struct sockaddr_in6 *)((char *)sa + sa->sin6_len);
                } else {
                    sa_tab[i] = NULL;
                }
            }
            
            if( ((rt->rtm_addrs & (RTA_DST|RTA_GATEWAY)) == (RTA_DST|RTA_GATEWAY))
               && sa_tab[RTAX_DST]->sin6_family == AF_INET6
               && sa_tab[RTAX_GATEWAY]->sin6_family == AF_INET6) {
                
//                unsigned char octet[4]  = {0,0,0,0};
//                for (i=0; i<4; i++){
//                    octet[i] = ( ((struct sockaddr_in6 *)(sa_tab[RTAX_GATEWAY]))->sin6_addr.s_addr >> (i*8) ) & 0xFF;
//                }
//                
//                if(((struct sockaddr_in *)sa_tab[RTAX_DST])->sin_addr.s_addr == 0) {
//                    if(octet[0] == 192 && octet[1] == 168){
//                        *addr = ((struct sockaddr_in6 *)(sa_tab[RTAX_GATEWAY]))->sin6_addr;
//                        r = 0;
//                        printf("gateway address--%d.%d.%d.%d\n",octet[0],octet[1],octet[2],octet[3]);
//                    }
//                }
                if (IN6_IS_ADDR_LINKLOCAL(&((struct sockaddr_in6 *)(sa_tab[RTAX_GATEWAY]))->sin6_addr)) {
                    *addr = ((struct sockaddr_in6 *)(sa_tab[RTAX_GATEWAY]))->sin6_addr;
                    r = 0;
                }
            }
        }
        free(buf);
    }
    return r;
}

#endif
