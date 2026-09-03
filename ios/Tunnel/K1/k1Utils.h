//
//  K1Utils.h
//  Gnwj
//
//  Created by Z0 on 06/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <NetworkExtension/NetworkExtension.h>

@interface K1Utils : NSObject

+ (NEIPv4Route *)defaultrouteWithIPString:(NSString *)ip;

@end

NS_INLINE BOOL UtilIsStringValid(NSString *str) {
    return str != nil && (id)str != [NSNull null] && ![str isEqualToString:@""];
}

NS_INLINE NSString *UtilStringWithInvalidPlaceholder(NSString *str, NSString *placeholder) {
    return UtilIsStringValid(str) ? str : placeholder;
}

extern BOOL check_UtilIsStringValidIPAddress(NSString *IPAddress);

