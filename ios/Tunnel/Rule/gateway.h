#ifndef __GATEWAY_H__
#define __GATEWAY_H__

#include <ctype.h>
#include <sys/param.h>
#include <sys/sysctl.h>
#include <stdlib.h>
#include <netinet/in.h>


/* defaultgateway() :
 * return value :
 *    0 : success
 *   -1 : failure    */
int defaultgateway(struct in_addr * addr);

/* defaultgateway6() :
 * return value :
 *    0 : success
 *   -1 : failure    */
int defaultgateway6(struct in6_addr * addr);

#endif
