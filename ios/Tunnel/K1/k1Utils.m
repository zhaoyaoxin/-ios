//
//  K1Utils.m
//  Gnwj
//
//  Created by Z0 on 06/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1Utils.h"
#import <arpa/inet.h>

@implementation K1Utils

+ (NEIPv4Route *)defaultrouteWithIPString:(NSString *)ip
{
    static NSDictionary *s_maskDict = nil;
    static dispatch_once_t onceToken;
    
    dispatch_once(&onceToken, ^{
        s_maskDict = @{
                       @"32": @"255.255.255.255",
                       @"31": @"255.255.255.254",
                       @"30": @"255.255.255.252",
                       @"29": @"255.255.255.248",
                       @"28": @"255.255.255.240",
                       @"27": @"255.255.255.224",
                       @"26": @"255.255.255.192",
                       @"25": @"255.255.255.128",
                       @"24": @"255.255.255.0",
                       @"23": @"255.255.254.0",
                       @"22": @"255.255.252.0",
                       @"21": @"255.255.248.0",
                       @"20": @"255.255.240.0",
                       @"19": @"255.255.224.0",
                       @"18": @"255.255.192.0",
                       @"17": @"255.255.128.0",
                       @"16": @"255.255.0.0",
                       @"15": @"255.254.0.0",
                       @"14": @"255.252.0.0",
                       @"13": @"255.248.0.0",
                       @"12": @"255.240.0.0",
                       @"11": @"255.224.0.0",
                       @"10": @"255.192.0.0",
                       @"9":  @"255.128.0.0",
                       @"8":  @"255.0.0.0",
                       @"7":  @"254.0.0.0",
                       @"6":  @"252.0.0.0",
                       @"5":  @"248.0.0.0",
                       @"4":  @"240.0.0.0",
                       @"3":  @"224.0.0.0",
                       @"2":  @"192.0.0.0",
                       @"1":  @"128.0.0.0",
                       @"0":  @"0.0.0.0" };
    });
    
    NSArray *eachIPRoute = [ip componentsSeparatedByString:@"/"];
    NSString *routeIP = eachIPRoute.firstObject;
    
    if ( check_UtilIsStringValidIPAddress(routeIP) ) {
        NSString *routeMask = s_maskDict[@"32"];
        if ( [eachIPRoute count] == 2 ) {
            routeMask = s_maskDict[eachIPRoute.lastObject] ?: @"32";
        }
        
        NEIPv4Route *route = [[NEIPv4Route alloc] initWithDestinationAddress:routeIP
                                                                  subnetMask:routeMask];
        return route;
    }
    
    return nil;
}


@end


extern BOOL check_UtilIsStringValidIPAddress(NSString *IPAddress)
{
    if (!UtilIsStringValid(IPAddress)) return NO;
    struct in_addr pin;
    int success = inet_aton([IPAddress UTF8String], &pin);
    if (success == 1) return TRUE;
    return NO;
}
